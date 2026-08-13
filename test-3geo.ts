async function t() {
  const url = `https://api.3geonames.org/?randomland=NO&lat=-24.2388&lon=-65.2652&format=json`;
  const res = await fetch(url);
  const data: any = await res.json();
  console.log(data);
}
t();
