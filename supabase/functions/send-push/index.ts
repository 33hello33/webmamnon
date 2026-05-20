import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Define your VAPID keys from environment variables
const publicVapidKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const privateVapidKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const email = "mailto:admin@yourdomain.com";

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(email, publicVapidKey, privateVapidKey);
}

serve(async (req) => {
  try {
    // Check method
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Get the request body (assuming it's a Supabase Webhook payload)
    const payload = await req.json();
    const record = payload.record;

    // Determine the target user ID and the notification content based on the table
    let targetUserId = "";
    let title = "Thông báo mới";
    let body = "Bạn có một thông báo mới từ hệ thống.";
    let url = "/";
    let badgeCount: number | null = 1;
    let incrementBadgeBy = 1;

    if (payload.table === "hv_messages") {
      // Chat message inserted
      targetUserId = record.mahv; // Target parent
      if (record.description === 'PH') {
        // Message sent by parent, so send push to teacher instead
        targetUserId = record.manv; 
      }
      title = "Tin nhắn mới";
      body = record.content || "Bạn có tin nhắn / tệp đính kèm mới.";
    } else if (payload.table === "tbl_thongbao") {
      // General notice
      targetUserId = record.mahv;
      title = record.tieude || "Thông báo từ nhà trường";
      body = record.ghichu || "Nhấn để xem chi tiết.";
    }

    if (!targetUserId) {
      return new Response("No target user ID", { status: 200 });
    }

    // Connect to Supabase to fetch the subscription
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (payload.table === "hv_messages") {
      if (record.description === "PH") {
        const { count } = await supabase
          .from("hv_messages")
          .select("*", { count: "exact", head: true })
          .eq("manv", record.manv)
          .is("is_read", false)
          .eq("description", "PH");

        badgeCount = count ?? 1;
      } else {
        const { count } = await supabase
          .from("hv_messages")
          .select("*", { count: "exact", head: true })
          .eq("mahv", record.mahv)
          .is("is_read", false)
          .not("manv", "is", null)
          .neq("description", "PH");

        badgeCount = count ?? 1;
      }
    } else if (payload.table === "tbl_thongbao") {
      badgeCount = null;
    }

    const { data: subscriptionData, error: subError } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", targetUserId)
      .single();

    if (subError || !subscriptionData || !subscriptionData.subscription) {
      console.log("No subscription found for user:", targetUserId);
      return new Response(JSON.stringify({ message: "No subscription found" }), { status: 200 });
    }

    const pushSubscription = subscriptionData.subscription;

    // Payload to send to the Service Worker
    const pushPayload = JSON.stringify({
      title: title,
      body: body,
      icon: "/logo192.png",
      badge: "/logo192.png",
      url: url,
      badgeCount,
      incrementBadgeBy
    });

    // Send push notification
    await webpush.sendNotification(pushSubscription, pushPayload);
    console.log("Push notification sent successfully to", targetUserId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error sending push notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
