async function test() {
  const lat = -24.185786;
  const lng = -65.299476;
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&f=pjson`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(data.address);
}
test();
