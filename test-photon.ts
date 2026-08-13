async function testPhoton() {
  const lat = -24.185617;
  const lng = -65.298108;
  const url = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`;
  const res = await fetch(url);
  const data: any = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
testPhoton();
