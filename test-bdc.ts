async function myTest3() {
  const lat = -24.185617;
  const lng = -65.298108;
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=es`;
  const res = await fetch(url);
  const data: any = await res.json();
  console.log(data);
}
myTest3();
