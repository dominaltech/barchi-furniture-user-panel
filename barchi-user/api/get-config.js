module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BLRlIrTI65YeYRK_UbJyEbtYpz6b6zLFs5NNG9-VzFT3CYQ2D_hmm8RQ0qf9UsTBEfXjNnw2FSqkaZnI7IX6wuM';
  const SB_URL = process.env.SB_URL || process.env.SUPABASE_URL || 'https://fyviuwmvyussvzeufuwg.supabase.co';
  const SB_KEY = process.env.SB_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dml1d212eXVzc3Z6ZXVmdXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTA3MTUsImV4cCI6MjEwMDk4NjcxNX0.JbpegqU_gzyp4kiUZo9yPccdqHCCalcyWLPcCABbqoc';

  return res.status(200).json({
    vapidPublicKey: VAPID_PUBLIC_KEY,
    supabaseUrl: SB_URL,
    supabaseKey: SB_KEY
  });
};
