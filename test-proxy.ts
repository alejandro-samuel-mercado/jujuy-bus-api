async function t() {
  const url = `https://api.allorigins.win/raw?url=` + encodeURIComponent(`https://photon.komoot.io/reverse?lon=-65.2652&lat=-24.2388`);
  const res = await fetch(url);
  console.log("Status:", res.status);
  const data: any = await res.json();
  console.log(data.features[0].properties);
}
t();
