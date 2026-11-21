import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { JSONContent } from "@tiptap/core";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const cloudConfigured = Boolean(supabaseUrl && supabaseKey);

let clientPromise: Promise<SupabaseClient> | null = null;

export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (!cloudConfigured) throw new Error("Supabase 尚未配置。");
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    );
  }
  return clientPromise;
}

export interface CloudDocumentSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface CloudDocument extends CloudDocumentSummary {
  content: JSONContent;
}

export interface SharedCloudDocument {
  id: string;
  title: string;
  content: JSONContent;
  updated_at: string;
}

export async function getCloudUser(): Promise<User | null> {
  if (!cloudConfigured) return null;
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function sendCloudLoginLink(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  });
  if (error) throw error;
}

export async function signOutCloud(): Promise<void> {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function listCloudDocuments(): Promise<CloudDocumentSummary[]> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCloudDocument(title: string, content: JSONContent): Promise<CloudDocument> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({ title, content })
    .select("id,title,content,updated_at")
    .single();
  if (error) throw error;
  return data as CloudDocument;
}

export async function updateCloudDocument(id: string, title: string, content: JSONContent): Promise<CloudDocument> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ title, content })
    .eq("id", id)
    .select("id,title,content,updated_at")
    .single();
  if (error) throw error;
  return data as CloudDocument;
}

export async function getCloudDocument(id: string): Promise<CloudDocument> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id,title,content,updated_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CloudDocument;
}

export async function deleteCloudDocument(id: string): Promise<void> {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw error;
}

export async function createCloudShare(documentId: string): Promise<string> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("document_shares")
    .insert({ document_id: documentId })
    .select("token")
    .single();
  if (error) throw error;
  return String(data.token);
}

export async function getSharedCloudDocument(token: string): Promise<SharedCloudDocument | null> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc("get_shared_document", {
    share_token: token
  });
  if (error) throw error;
  return (data as SharedCloudDocument | null) ?? null;
}

export function cloudShareUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#share=${token}`;
}

export function currentCloudShareToken(): string | null {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(hash).get("share");
}

export function isMagicLinkCallback(): boolean {
  return window.location.hash.includes("access_token=") || window.location.search.includes("code=");
}
