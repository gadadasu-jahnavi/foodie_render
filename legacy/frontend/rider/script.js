
(function () {
    // Backend API URL: same Flask server as the admin panel (port 5000).
    // Served by Flask -> relative /api. Opened from anywhere else (Live Server, file) -> Flask on port 5000.
    var API = (location.port === '5000')
        ? '/api'
        : 'http://' + (location.hostname || '127.0.0.1') + ':5000/api';

    var step = 0;
    var files = {};

    var $ = function (s, r) {
        return (r || document).querySelector(s);
    };

    var $$ = function (s, r) {
        return Array.prototype.slice.call(
            (r || document).querySelectorAll(s)
        );
    };

    var sections = $$('.step');
    var items = $$('#steps li');

    var titles = [
        ['Create your rider account', 'Tell us a little about yourself.'],
        ['Vehicle details', 'What will you ride while delivering?'],
        ['Upload documents', 'We use these to verify your identity.']
    ];

    function veh() {
        return $('input[name=veh]:checked').value;
    }

    function isCycle() {
        return veh() === 'Cycle';
    }

    function bad(el, on) {
        var f = el.closest('.f');
        if (f) f.classList.toggle('bad', on);
        return !on;
    }

    // Form validation
    function validate(n) {
        var ok = true;

        if (n === 0) {
            ok = bad(
                $('#name'),
                $('#name').value.trim().length < 2
            ) && ok;

            ok = bad(
                $('#email'),
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                    $('#email').value.trim()
                )
            ) && ok;

            ok = bad(
                $('#phone'),
                !/^[6-9]\d{9}$/.test($('#phone').value.trim())
            ) && ok;

            ok = bad(
                $('#pw'),
                $('#pw').value.length < 8
            ) && ok;

            ok = bad(
                $('#pw2'),
                $('#pw2').value !== $('#pw').value ||
                !$('#pw2').value
            ) && ok;

            $('#email').closest('.f').querySelector('.msg').textContent =
                'Enter a valid email address.';

            $('#phone').closest('.f').querySelector('.msg').textContent =
                'Enter a 10-digit mobile number.';

        } else if (n === 1) {
            var c = isCycle();

            ok = bad(
                $('#lic'),
                !c && $('#lic').value.trim().length < 5
            ) && ok;

            ok = bad(
                $('#vno'),
                !c && $('#vno').value.trim().length < 4
            ) && ok;

        } else {
            ok = bad(
                $('[data-key=aadhaar]'),
                !files.aadhaar
            ) && ok;

            ok = bad(
                $('[data-key=licence]'),
                !isCycle() && !files.licence
            ) && ok;

            ok = bad(
                $('[data-key=photo]'),
                !files.photo
            ) && ok;
        }

        return ok;
    }

    // Display registration steps
    function show(n) {
        step = n;

        sections.forEach(function (s, i) {
            s.classList.toggle('show', i === n);
        });

        items.forEach(function (li, i) {
            li.classList.toggle('active', i === n);
            li.classList.toggle('done', i < n);

            $('.dot', li).textContent = i < n ? '✓' : (i + 1);
        });

        $('#title').textContent = titles[n][0];
        $('#sub').textContent = titles[n][1];

        $('#badge').textContent = 'Step ' + (n + 1) + ' of 3';
        $('#bar').style.width = ((n + 1) / 3 * 100) + '%';

        $('#back').style.visibility = n ? 'visible' : 'hidden';
        $('#next').textContent = n === 2 ? 'Register' : 'Next';

        var c = isCycle();

        $('#licUp').style.display = c ? 'none' : '';

        window.scrollTo(0, 0);
    }

    // Vehicle selection
    function cycleUI() {
        var c = isCycle();

        $('#lic').closest('.f').style.display = c ? 'none' : '';
        $('#vno').closest('.f').style.display = c ? 'none' : '';
        $('#cycleNote').style.display = c ? 'block' : 'none';
    }

    $$('input[name=veh]').forEach(function (r) {
        r.addEventListener('change', cycleUI);
    });

    // Password visibility
    $$('.eye').forEach(function (b) {
        b.addEventListener('click', function () {
            var i = document.getElementById(b.dataset.eye);

            i.type = i.type === 'password' ? 'text' : 'password';
        });
    });

    // Phone number input
    $('#phone').addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/\D/g, '');
    });

    // Clear validation errors when typing
    $$('input[type=text],input[type=email],input[type=tel],input[type=password]')
        .forEach(function (i) {
            i.addEventListener('input', function () {
                var f = i.closest('.f');
                if (f) f.classList.remove('bad');
            });
        });

    // Document uploads
    $$('.drop').forEach(function (d) {
        var inp = $('input', d);

        inp.addEventListener('change', function () {
            var f = inp.files[0];

            if (!f) return;

            files[d.dataset.key] = f;

            d.classList.add('has');
            d.closest('.f').classList.remove('bad');

            $('b', d).textContent = 'File added';
            $('small', d).textContent = f.name;

            var ico = $('.ico', d);

            if (/^image\//.test(f.type)) {
                var reader = new FileReader();

                reader.onload = function () {
                    ico.innerHTML = '';

                    var im = new Image();
                    im.alt = '';
                    im.src = reader.result;

                    ico.appendChild(im);
                };

                reader.readAsDataURL(f);
            } else {
                ico.textContent = '✅';
            }
        });
    });

    // Reset registration form
    function reset() {
        $$('input[type=text],input[type=email],input[type=tel],input[type=password]')
            .forEach(function (i) {
                i.value = '';
            });

        $$('.f.bad').forEach(function (f) {
            f.classList.remove('bad');
        });

        $$('input[type=file]').forEach(function (i) {
            i.value = '';
        });

        files = {};

        var icons = {
            aadhaar: ['🪪', 'Choose a file'],
            licence: ['📄', 'Choose a file'],
            photo: ['🙂', 'Choose a photo']
        };

        $$('.drop').forEach(function (d) {
            var k = d.dataset.key;

            d.classList.remove('has');

            $('.ico', d).textContent = icons[k][0];
            $('b', d).textContent = icons[k][1];

            $('small', d).textContent =
                k === 'photo'
                    ? 'Clear face photo · JPG or PNG'
                    : (k === 'aadhaar'
                        ? 'Front side · JPG, PNG or PDF'
                        : 'Driving licence · JPG, PNG or PDF');
        });

        $('input[name=veh][value=Bike]').checked = true;

        cycleUI();

        $('#done').style.display = 'none';
        $('#formArea').style.display = 'block';

        show(0);
    }

    // Register button
    $('#next').addEventListener('click', async function () {

        if (!validate(step)) return;

        if (step < 2) {
            return show(step + 1);
        }

        // Send registration details to the Flask API (same database the Admin Panel reads)
        var btn = $('#next');
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = 'Submitting…';
        try {
            var fd = new FormData();

            fd.append('name', $('#name').value.trim());

            fd.append(
                'email',
                $('#email').value.trim().toLowerCase()
            );

            fd.append('phone', $('#phone').value.trim());
            fd.append('password', $('#pw').value);
            fd.append('confirm_password', $('#pw2').value);
            fd.append('vehicle', veh());

            if (!isCycle()) {
                fd.append('licence_number', $('#lic').value.trim());

                fd.append(
                    'vehicle_number',
                    $('#vno').value.trim().toUpperCase()
                );

                fd.append('licence', files.licence);
            }

            fd.append('aadhaar', files.aadhaar);
            fd.append('photo', files.photo);

            var response = await fetch(API + '/riders/register', {
                method: 'POST',
                body: fd
            });

            var data = await response.json().catch(function () { return {}; });

            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            // Show success screen only after backend registration succeeds
            $('#sName').textContent =
                $('#name').value.trim().split(' ')[0];

            var rows = [
                ['Name', $('#name').value.trim()],
                ['Email', $('#email').value.trim()],
                ['Phone', '+91 ' + $('#phone').value],
                [
                    'Vehicle',
                    veh() + (
                        isCycle()
                            ? ''
                            : ' · ' + $('#vno').value.trim().toUpperCase()
                    )
                ]
            ];

            $('#sum').innerHTML = rows.map(function (r) {
                var a = document.createElement('div');
                a.textContent = r[0];

                var b = document.createElement('div');
                b.textContent = r[1];

                return '<dt>' + a.innerHTML + '</dt>' +
                    '<dd>' + b.innerHTML + '</dd>';
            }).join('');

            $('#formArea').style.display = 'none';
            $('#done').style.display = 'block';

            window.scrollTo(0, 0);

        } catch (error) {
            alert('Registration failed: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Register';
        }
    });

    // Back button
    $('#back').addEventListener('click', function () {
        if (step > 0) show(step - 1);
    });

    // Cancel button
    $('#cancel').addEventListener('click', function () {
        if (confirm('Cancel registration? Everything you entered will be cleared.')) {
            reset();
        }
    });

    // Register another rider
    $('#again').addEventListener('click', reset);

    cycleUI();
    show(0);

})();
