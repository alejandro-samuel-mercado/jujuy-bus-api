async function run() {
  try {
    // 1. Get a token
    let regRes = await fetch('http://localhost:3001/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test' + Date.now() + '@test.com',
        nombre: 'Test User',
        password: 'password123'
      })
    });
    let regData = await regRes.json();
    const token = regData.token;

    // 2. Get lines
    let linesRes = await fetch('http://localhost:3001/lineas', {
      headers: { Authorization: `Bearer ${token}` }
    });
    let linesData = await linesRes.json();
    const linea = linesData[0];

    // 3. Post message
    let msgRes = await fetch(`http://localhost:3001/lineas/${linea.id}/mensajes`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ texto: "Hello world" })
    });
    
    let msgData = await msgRes.json();
    if (!msgRes.ok) {
        console.log("ERROR:", msgData);
    } else {
        console.log("SUCCESS:", msgData);
    }
  } catch (err) {
    console.log("FETCH ERROR:", err.message);
  }
}
run();
