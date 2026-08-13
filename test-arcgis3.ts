async function myTest2() {
  const lat = -24.185617;
  const lng = -65.298108; // Adjusted to be on a road
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&f=pjson`;
  const res = await fetch(url);
  const data: any = await res.json();
  console.log(data.address);
}
myTest2();
