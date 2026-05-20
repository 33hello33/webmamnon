import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const publicVapidKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const privateVapidKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const email = "mailto:admin@yourdomain.com";

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(email, publicVapidKey, privateVapidKey);
}

type WebhookPayload = {
  table?: string;
  record?: Record<string, unknown>;
  new?: Record<string, unknown>;
};

type PushTarget = {
  userId: string;
  role: "parent" | "teacher";
};

type PushMessage = {
  title: string;
  body: string;
  url: string;
  badgeCount: number | null;
  incrementBadgeBy: number;
};

const normalizeString = (value: unknown) => String(value ?? "").trim();

const isWebhookInsert = (payload: WebhookPayload) => {
  const table = normalizeString(payload.table);
  const record = payload.record ?? payload.new;
  return Boolean(table && record && typeof record === "object");
};

const getUnreadBadgeForTeacher = async (
  supabase: ReturnType<typeof createClient>,
  teacherId: string,
) => {
  const { data, error } = await supabase
    .from("hv_messages")
    .select("id, manv, description, is_read")
    .eq("manv", teacherId)
    .is("is_read", false)
    .eq("description", "PH");

  if (error) {
    console.error("Error counting teacher unread messages:", error);
    return 1;
  }

  return (data || []).length || 1;
};

const getUnreadBadgeForParent = async (
  supabase: ReturnType<typeof createClient>,
  studentId: string,
) => {
  const { data, error } = await supabase
    .from("hv_messages")
    .select("id, manv, description, is_read")
    .eq("mahv", studentId)
    .is("is_read", false);

  if (error) {
    console.error("Error counting parent unread messages:", error);
    return 1;
  }

  const unreadCount = (data || []).filter((item) => {
    const senderId = normalizeString(item.manv);
    return senderId !== "" && normalizeString(item.description) !== "PH";
  }).length;

  return unreadCount || 1;
};

const buildPushContext = async (
  supabase: ReturnType<typeof createClient>,
  payload: WebhookPayload,
): Promise<{ targets: PushTarget[]; message: PushMessage } | null> => {
  const table = normalizeString(payload.table);
  const record = (payload.record ?? payload.new ?? {}) as Record<string, unknown>;

  if (table === "hv_messages") {
    const isParentMessage = normalizeString(record.description) === "PH";
    const userId = isParentMessage
      ? normalizeString(record.manv)
      : normalizeString(record.mahv);

    if (!userId) return null;

    return {
      targets: [{
        userId,
        role: isParentMessage ? "teacher" : "parent",
      }],
      message: {
        title: "Tin nhắn mới",
        body: normalizeString(record.content) || "Bạn có tin nhắn hoặc tệp đính kèm mới.",
        url: "/",
        badgeCount: isParentMessage
          ? await getUnreadBadgeForTeacher(supabase, userId)
          : await getUnreadBadgeForParent(supabase, userId),
        incrementBadgeBy: 1,
      },
    };
  }

  if (table === "tbl_thongbao") {
    const userId = normalizeString(record.mahv);
    if (!userId) return null;

    return {
      targets: [{ userId, role: "parent" }],
      message: {
        title: normalizeString(record.tieude) || "Thông báo từ nhà trường",
        body: normalizeString(record.ghichu) || "Nhấn để xem chi tiết.",
        url: "/",
        badgeCount: null,
        incrementBadgeBy: 1,
      },
    };
  }

  if (table === "class_announcements") {
    const classId = normalizeString(record.malop);
    if (!classId) return null;

    const { data: students, error } = await supabase
      .from("tbl_hv")
      .select("mahv")
      .eq("malop", classId)
      .or('trangthai.neq."Đã Nghỉ",trangthai.is.null');

    if (error) {
      console.error("Error loading students for class announcement:", error);
      return null;
    }

    const targets = (students || [])
      .map((student) => normalizeString(student.mahv))
      .filter(Boolean)
      .map((userId) => ({ userId, role: "parent" as const }));

    if (targets.length === 0) return null;

    const title = normalizeString(record.title);
    let fallbackTitle = "Thông báo lớp mới";
    if (title === "THỰC ĐƠN") fallbackTitle = "Thực đơn mới";
    else if (title === "NGOẠI KHÓA") fallbackTitle = "Hoạt động ngoại khóa mới";
    else if (title === "CHƯƠNG TRÌNH HỌC") fallbackTitle = "Chương trình học mới";

    return {
      targets,
      message: {
        title: title || fallbackTitle,
        body: normalizeString(record.content) || "Nhấn để xem chi tiết.",
        url: "/",
        badgeCount: null,
        incrementBadgeBy: 1,
      },
    };
  }

  if (table === "suckhoedinhky") {
    const userId = normalizeString(record.mahv);
    if (!userId) return null;

    return {
      targets: [{ userId, role: "parent" }],
      message: {
        title: "Cập nhật sức khỏe",
        body: "Bé vừa có thông tin sức khỏe mới.",
        url: "/",
        badgeCount: null,
        incrementBadgeBy: 1,
      },
    };
  }

  return null;
};

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!publicVapidKey || !privateVapidKey) {
      return new Response(JSON.stringify({ error: "Missing VAPID keys" }), {
        headers: { "Content-Type": "application/json" },
        status: 500,
      });
    }

    const payload = await req.json() as WebhookPayload;
    if (!isWebhookInsert(payload)) {
      return new Response(JSON.stringify({ message: "Ignored payload" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const context = await buildPushContext(supabase, payload);
    if (!context || context.targets.length === 0) {
      return new Response(JSON.stringify({ message: "No push targets" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const results = [];

    for (const target of context.targets) {
      const { data: subscriptionData, error: subError } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", target.userId)
        .eq("role", target.role)
        .maybeSingle();

      if (subError || !subscriptionData?.subscription) {
        console.log("No subscription found for target:", target);
        results.push({ ...target, sent: false, reason: "no_subscription" });
        continue;
      }

      const pushPayload = JSON.stringify({
        title: context.message.title,
        body: context.message.body,
        icon: "/logo192.png",
        badge: "/logo192.png",
        url: context.message.url,
        badgeCount: context.message.badgeCount,
        incrementBadgeBy: context.message.incrementBadgeBy,
      });

      try {
        await webpush.sendNotification(subscriptionData.subscription, pushPayload);
        results.push({ ...target, sent: true });
      } catch (pushError) {
        console.error("Error sending push notification:", target, pushError);
        results.push({
          ...target,
          sent: false,
          reason: pushError instanceof Error ? pushError.message : "push_failed",
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
