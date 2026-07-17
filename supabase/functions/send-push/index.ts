import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const publicVapidKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const privateVapidKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const email = "mailto:admin@yourdomain.com";

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(email, publicVapidKey, privateVapidKey);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  tag: string;
};

const normalizeString = (value: unknown) => String(value ?? "").trim();
const uniqueStrings = (values: unknown[]) =>
  [...new Set(values.map(normalizeString).filter(Boolean))];

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

const getTeacherSubscription = async (
  supabase: ReturnType<typeof createClient>,
  teacherId: string,
) => {
  const exactLookup = await supabase
    .from("push_subscriptions")
    .select("subscription, user_id, updated_at")
    .eq("user_id", teacherId)
    .eq("role", "teacher")
    .maybeSingle();

  if (exactLookup.data?.subscription) {
    return exactLookup;
  }

  const { data: teacherRecord } = await supabase
    .from("tbl_nv")
    .select("manv, username, tennv")
    .or(`manv.eq.${teacherId},username.eq.${teacherId},tennv.eq.${teacherId}`)
    .maybeSingle();

  const candidateIds = uniqueStrings([
    teacherId,
    teacherRecord?.manv,
    teacherRecord?.username,
    teacherRecord?.tennv,
  ]);

  if (candidateIds.length <= 1) {
    return exactLookup;
  }

  const aliasLookup = await supabase
    .from("push_subscriptions")
    .select("subscription, user_id, updated_at")
    .in("user_id", candidateIds)
    .eq("role", "teacher")
    .order("updated_at", { ascending: false })
    .limit(1);

  const aliasMatch = aliasLookup.data?.[0];
  return {
    data: aliasMatch ? { subscription: aliasMatch.subscription } : null,
    error: aliasLookup.error,
  };
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
        tag: `hv_messages_${normalizeString(record.id) || Date.now()}`,
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
        tag: `tbl_thongbao_${normalizeString(record.id || record.mahd) || Date.now()}`,
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

    const rawTitle = normalizeString(record.title);
    let displayTitle = rawTitle || "Thông báo lớp mới";
    if (rawTitle === "THỰC ĐƠN") displayTitle = "Thực đơn mới";
    else if (rawTitle === "NGOẠI KHÓA") displayTitle = "Hoạt động ngoại khóa mới";
    else if (rawTitle === "CHƯƠNG TRÌNH HỌC") displayTitle = "Chương trình học mới";

    return {
      targets,
      message: {
        title: displayTitle,
        body: normalizeString(record.content) || "Nhấn để xem chi tiết.",
        url: "/",
        badgeCount: null,
        incrementBadgeBy: 1,
        tag: `class_announcements_${normalizeString(record.id) || Date.now()}`,
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
        tag: `suckhoedinhky_${normalizeString(record.id) || Date.now()}`,
      },
    };
  }

  return null;
};

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    if (!publicVapidKey || !privateVapidKey) {
      return new Response(JSON.stringify({ error: "Missing VAPID keys" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 500,
      });
    }

    const payload = await req.json() as WebhookPayload;
    if (!isWebhookInsert(payload)) {
      return new Response(JSON.stringify({ message: "Ignored payload" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 200,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const context = await buildPushContext(supabase, payload);
    if (!context || context.targets.length === 0) {
      return new Response(JSON.stringify({ message: "No push targets" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
        status: 200,
      });
    }

    const pushPayload = JSON.stringify({
      title: context.message.title,
      body: context.message.body,
      icon: "/appleicon.png",
      badge: "/appleicon.png",
      url: context.message.url,
      badgeCount: context.message.badgeCount,
      incrementBadgeBy: context.message.incrementBadgeBy,
      tag: context.message.tag,
    });

    const settled = await Promise.allSettled(
      context.targets.map(async (target) => {
        const subscriptionLookup = target.role === "teacher"
          ? await getTeacherSubscription(supabase, target.userId)
          : await supabase
            .from("push_subscriptions")
            .select("subscription")
            .eq("user_id", target.userId)
            .eq("role", target.role)
            .maybeSingle();

        const { data: subscriptionData, error: subError } = subscriptionLookup;

        if (subError || !subscriptionData?.subscription) {
          console.log("No subscription found for target:", target);
          return { ...target, sent: false, reason: "no_subscription" };
        }

        try {
          await webpush.sendNotification(subscriptionData.subscription, pushPayload);
          return { ...target, sent: true };
        } catch (pushError) {
          console.error("Error sending push notification:", target, pushError);
          return {
            ...target,
            sent: false,
            reason: pushError instanceof Error ? pushError.message : "push_failed",
          };
        }
      })
    );

    const results = settled.map((s) =>
      s.status === "fulfilled" ? s.value : { sent: false, reason: "promise_rejected" }
    );

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 200,
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 500,
    });
  }
});
