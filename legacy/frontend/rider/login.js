/* Rider login -> Flask API (/api/auth/login). Only ADMIN-APPROVED riders can sign in.
   No rider data or passwords are stored in the browser; only the session token is kept
   (so dashboard.html can call the API) and it is removed on logout. */
(function(){
  var $ = function(s){ return document.querySelector(s); };
  var TOKEN = 'foodie.rider.token';
  var API = (location.port === '5000') ? '/api' : 'http://' + (location.hostname || '127.0.0.1') + ':5000/api';

  function bad(input, on){ input.closest('.f').classList.toggle('bad', on); return !on; }
  function showAlert(text){ var a = $('#alert'); a.textContent = text; a.className = 'alert show'; }
  function hideAlert(){ $('#alert').className = 'alert'; }

  function showWelcome(user){
    $('#wName').textContent = (user.name || '').split(' ')[0];
    var rows = [['Name', user.name], ['Email', user.email], ['Phone', '+91 ' + user.phone],
                ['Vehicle', user.vehicle + (user.vehicle_number ? ' · ' + user.vehicle_number : '')],
                ['Status', user.status]];
    var list = $('#wSum'); list.innerHTML = '';
    rows.forEach(function(r){
      var dt = document.createElement('dt'); dt.textContent = r[0];
      var dd = document.createElement('dd'); dd.textContent = r[1] == null ? '' : r[1];
      list.appendChild(dt); list.appendChild(dd);
    });
    $('#loginArea').style.display = 'none';
    $('#welcome').style.display = 'block';
  }

  document.querySelectorAll('.eye').forEach(function(b){
    b.addEventListener('click', function(){
      var i = document.getElementById(b.dataset.eye);
      i.type = i.type === 'password' ? 'text' : 'password';
    });
  });
  document.querySelectorAll('input').forEach(function(i){
    i.addEventListener('input', function(){ bad(i, false); hideAlert(); });
  });

  $('#loginForm').addEventListener('submit', async function(e){
    e.preventDefault(); hideAlert();
    var id = $('#identifier'), pw = $('#password');
    var ok = true;
    ok = bad(id, id.value.trim() === '') && ok;
    ok = bad(pw, pw.value === '') && ok;
    if (!ok) return;
    try {
      var res = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'rider', identifier: id.value.trim(), password: pw.value }) });
      var data = await res.json().catch(function(){ return {}; });
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem(TOKEN, data.token);
      showWelcome(data.user);
    } catch (err) { showAlert(err.message); }
  });

  $('#logout').addEventListener('click', function(){
    localStorage.removeItem(TOKEN);
    $('#loginForm').reset();
    $('#welcome').style.display = 'none';
    $('#loginArea').style.display = 'block';
  });

  // Already signed in (refresh / coming back from the dashboard)? Ask the server; it rejects non-approved riders.
  var saved = localStorage.getItem(TOKEN);
  if (saved) {
    fetch(API + '/rider/me', { headers: { Authorization: 'Bearer ' + saved } })
      .then(function(r){ if (!r.ok) throw 0; return r.json(); })
      .then(function(u){ showWelcome({ name: u.name, email: u.email, phone: u.phone, vehicle: u.vehicle,
                                       vehicle_number: u.vehicle_number, status: u.status }); })
      .catch(function(){ localStorage.removeItem(TOKEN); });
  }
})();
