async function t() {
  const url = `https://geocode.xyz/-24.2388,-65.2652?json=1`;
  const res = await fetch(url);
  const data: any = await res.json();
  console.log(data);
}
t();
