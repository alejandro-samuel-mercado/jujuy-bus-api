async function myTestQgis() {
  const lat = -24.185617;
  const lng = -65.298108;
  const url = `https://nominatim.qgis.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'QGIS/3.0' } });
  if (!res.ok) {
    console.log("Error HTTP", res.status);
    return;
  }
  const data: any = await res.json();
  console.log(data.address);
}
myTestQgis();
