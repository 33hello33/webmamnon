export async function triggerPushNotification(supabase, table, record) {
  if (!supabase || !table || !record) return;

  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: {
        schema: process.env.REACT_APP_SUPABASE_SCHEMA || 'public',
        table,
        record
      }
    });

    if (error) {
      console.error(`Push invoke failed for ${table}:`, error);
    }
  } catch (error) {
    console.error(`Push invoke crashed for ${table}:`, error);
  }
}
