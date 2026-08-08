import { getActiveSchema } from '../supabase';

export async function triggerPushNotification(supabase, table, record, schema = null) {
  if (!supabase || !table || !record) return;

  try {
    const activeSchema = schema || getActiveSchema();
    const { error } = await supabase.functions.invoke('send-push', {
      body: {
        table,
        record,
        schema: activeSchema
      }
    });

    if (error) {
      console.error(`Push invoke failed for ${table} [schema: ${activeSchema}]:`, error);
    }
  } catch (error) {
    console.error(`Push invoke crashed for ${table}:`, error);
  }
}
