import { createClient, type User } from "@supabase/supabase-js";
import type { JSONContent } from "@tiptap/core";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const cloudConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = cloudConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

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

function client() {
  if (!supabase) throw new Error("Supabase 尚未配置。");
  return supabase;
}

export async function getCloudUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function sendCloudLoginLink(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  });
  if (error) throw error;
}

export async function signOutCloud(): Promise<void> {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

export async function listCloudDocuments(): Promise<CloudDocumentSummary[]> {
  const { data, error } = await client()
    .from("documents")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCloudDocument(title: string, content: JSONContent): Promise<CloudDocument> {
  const { data, error } = await client()
    .from("documents")
    .insert({ title, content })
    .select("id,title,content,updated_at")
    .single();
  if (error) throw error;
  return data as CloudDocument;
}

export async function updateCloudDocument(id: string, title: string, content: JSONContent): Promise<CloudDocument> {
  const { data, error } = await client()
    .from("documents")
    .update({ title, content })
    .eq("id", id)
    .select("id,title,content,updated_at")
    .single();
  if (error) throw error;
  return data as CloudDocument;
}

export async function getCloudDocument(id: string): Promise<CloudDocument> {
  const { data, error } = await client()
    .from("documents")
    .select("id,title,content,updated_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CloudDocument;
}

export async function deleteCloudDocument(id: string): Promise<void> {
  const { error } = await client().from("documents").delete().eq("id", id);
  if (error) throw error;
}

export async function createCloudShare(documentId: string): Promise<string> {
  const { data, error } = await client()
    .from("document_shares")
    .insert({ document_id: documentId })
    .select("token")
    .single();
  if (error) throw error;
  return String(data.token);
}

export async function getSharedCloudDocument(token: string): Promise<SharedCloudDocument | null> {
  const { data, error } = await client().rpc("get_shared_document", {
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
