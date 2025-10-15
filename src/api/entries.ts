export async function sendEntryOnline(data: any) {
  const r = await fetch('/api/entries', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('API error');
  return r.json();
}
