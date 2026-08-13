async function myTest4() {
  const lat = -24.185617;
  const lng = -65.298108;
  const url = `https://geocode.xyz/${lat},${lng}?json=1`;
  const res = await fetch(url);
  const data: any = await res.json();
  console.log(data);
}
myTest4();
