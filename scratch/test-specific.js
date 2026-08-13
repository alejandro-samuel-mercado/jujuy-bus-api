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

    // 2. Post message to specific linea
    const lineaId = '0af2c04d-6298-4d80-a166-bbccbd9f7e20';
    let msgRes = await fetch(`http://localhost:3001/lineas/${lineaId}/mensajes`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ texto: "Testing specific line" })
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
