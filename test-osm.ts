async function t() {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=-24.185617&lon=-65.298108&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'JujuyBusTest/1.0 (test@example.com)' }});
  console.log("Status:", res.status);
}
t();
