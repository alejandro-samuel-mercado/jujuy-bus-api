async function t() {
  const lat = -24.2388;
  const lng = -65.2652;
  const url = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`;
  const res = await fetch(url);
  const data: any = await res.json();
  console.log(JSON.stringify(data.features[0].properties, null, 2));
}
t();
