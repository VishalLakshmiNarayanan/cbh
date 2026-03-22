
async function check() {
  const KEY = 'a5720eaec95c4aedb0b782e3fa53da7a';
  try {
    const res = await fetch('https://api.tavus.io/v2/replicas', {
      headers: { 'x-api-key': KEY }
    });
    const data = await res.json();
    console.log("REPLICAS:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}
check();
