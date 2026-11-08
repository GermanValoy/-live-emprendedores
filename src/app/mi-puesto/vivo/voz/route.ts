import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { atenderVoz } from "@/lib/voz/atender";
import { transcribir } from "@/lib/voz/whisper";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return atenderVoz(request, { userId: data.user?.id ?? null, admin: createAdminClient(), transcribir });
}
