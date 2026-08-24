/* Otto Trader — the one thing you ever have to edit.
 *
 * Paste your Supabase ANON key between the quotes below. Save. That's it.
 * Supabase dashboard -> Settings -> API Keys -> "Legacy anon, service_role"
 * -> copy the one labelled `anon` `public`.
 *
 * This key is PUBLIC by design. It names the project and nothing more —
 * row-level security in Postgres is what actually protects the data, and it is
 * already switched on. It belongs in source; that is what it is for.
 */
window.OTTO = {
  // Where sign-in links must come back to. Stated outright rather than
  // derived from location, because a trailing slash or a stray path made
  // Supabase fall back and drop "/otto-trader/" entirely.
  site: "https://proagentmax.github.io/otto-trader/",
  url:  "https://loykixugjltxukuvbbuf.supabase.co",
  anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxveWtpeHVnamx0eHVrdXZiYnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MzcxNTUsImV4cCI6MjEwMzExMzE1NX0.5hCDRTHK3yAKaKgXxrbb4ZE_joIHMT3AQ-OtyFBtl44"
};
