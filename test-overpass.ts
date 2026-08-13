async function testOverpass() {
  const lat = -24.185617;
  const lng = -65.298108;
  const query = `[out:json];is_in(${lat},${lng})->.a;area.a[admin_level="9"];out tags;`;
  const url = `https://overpass-api.de/api/interpreter`;
  const res = await fetch(url, { method: 'POST', body: query });
  const data: any = await res.json();
  console.log(JSON.stringify(data));
}
testOverpass();
