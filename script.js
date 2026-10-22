(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var fmtMoney = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 });
  var fmtDate = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  var fmtPct = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });
  var round2 = function (n) { return Math.round(n * 100) / 100; };
  var MAX_MESES = 600;

  var el = {
    monto: $('monto'), tasa: $('tasa'), tipoTasa: $('tipoTasa'),
    cuota: $('cuota'), rango: $('cuotaRango'),
    fecha: $('fechaInicio'), primerPago: $('primerPago')
  };

  // Tasa mensual efectiva a partir de lo que escribe la persona.
  function tasaMensual(tasa, tipo) {
    var t = tasa / 100;
    return tipo === 'anual' ? Math.pow(1 + t, 1 / 12) - 1 : t;
  }

  // Último día del mes (30 o 31; 28 o 29 en febrero), n meses después del mes de la fecha base.
  function finDeMes(base, n) {
    return new Date(base.getFullYear(), base.getMonth() + n + 1, 0);
  }

  function parseFecha(valor) {
    var p = (valor || '').split('-');
    if (p.length !== 3) return new Date();
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function hoyISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // Simula el préstamo con cuota fija. Devuelve el calendario o un motivo si nunca se termina.
  function simular(monto, r, cuota, base, offset) {
    var saldo = round2(monto);
    var filas = [];
    var totalInteres = 0;
    if (monto <= 0 || cuota <= 0) return { error: 'datos' };
    if (round2(saldo * r) >= cuota && r > 0) return { error: 'cuota-baja', interesInicial: round2(saldo * r) };

    for (var i = 0; i < MAX_MESES && saldo > 0.004; i++) {
      var interes = round2(saldo * r);
      var pago = Math.min(cuota, round2(saldo + interes));
      var capital = round2(pago - interes);
      saldo = round2(saldo - capital);
      totalInteres = round2(totalInteres + interes);
      filas.push({
        n: i + 1,
        fecha: finDeMes(base, offset + i),
        pago: pago,
        interes: interes,
        capital: capital,
        saldo: saldo < 0 ? 0 : saldo
      });
    }
    if (saldo > 0.004) return { error: 'muy-largo' };

    var totalPagado = round2(monto + totalInteres);
    return { filas: filas, meses: filas.length, interes: totalInteres, total: totalPagado, ultimo: filas[filas.length - 1] };
  }

  function textoMeses(m) {
    var anios = Math.floor(m / 12);
    var resto = m % 12;
    var partes = [];
    if (anios > 0) partes.push(anios + (anios === 1 ? ' año' : ' años'));
    if (resto > 0) partes.push(resto + (resto === 1 ? ' mes' : ' meses'));
    return partes.join(' y ');
  }

  function leer() {
    var monto = parseFloat(el.monto.value);
    var tasa = parseFloat(el.tasa.value);
    var cuota = parseFloat(el.cuota.value);
    return {
      monto: isFinite(monto) ? monto : 0,
      tasa: isFinite(tasa) && tasa >= 0 ? tasa : 0,
      tipo: el.tipoTasa.value,
      cuota: isFinite(cuota) ? cuota : 0,
      base: parseFecha(el.fecha.value),
      offset: parseInt(el.primerPago.value, 10) || 0
    };
  }

  function pintarAviso(res, d, r) {
    var aviso = $('aviso');
    if (res.error === 'cuota-baja') {
      aviso.hidden = false;
      aviso.textContent = 'Con un pago de ' + fmtMoney.format(d.cuota) + ' no se termina de pagar: solo el interés del primer mes es ' + fmtMoney.format(res.interesInicial) + '. Sube el pago mensual.';
    } else if (res.error === 'muy-largo') {
      aviso.hidden = false;
      aviso.textContent = 'Con ese pago tardarías más de 50 años en terminar. Sube el pago mensual.';
    } else if (res.error === 'datos') {
      aviso.hidden = false;
      aviso.textContent = 'Escribe un monto y un pago mensual mayores que cero.';
    } else {
      aviso.hidden = true;
    }
  }

  function limpiarResultados() {
    ['kMeses', 'kInteres', 'kTotal'].forEach(function (id) { $(id).textContent = '—'; });
    ['kMesesSub', 'kInteresSub', 'kTotalSub', 'legCapital', 'legInteres'].forEach(function (id) { $(id).textContent = ''; });
    $('barCapital').style.width = '0%';
    $('barInteres').style.width = '0%';
    document.querySelector('#calendario tbody').innerHTML = '';
  }

  function pintarCalendario(res) {
    var html = '';
    for (var i = 0; i < res.filas.length; i++) {
      var f = res.filas[i];
      html += '<tr><td>' + f.n + '</td><td>' + fmtDate.format(f.fecha) + '</td><td>' + fmtMoney.format(f.pago) +
        '</td><td class="int-col">' + fmtMoney.format(f.interes) + '</td><td>' + fmtMoney.format(f.capital) +
        '</td><td>' + fmtMoney.format(f.saldo) + '</td></tr>';
    }
    document.querySelector('#calendario tbody').innerHTML = html;
  }

  function pintarComparacion(d, r) {
    var cuotas = [500, 550, 600, 650, 700, 750, 800];
    var html = '';
    cuotas.forEach(function (c) {
      var s = simular(d.monto, r, c, d.base, d.offset);
      var activa = Math.abs(c - d.cuota) < 0.005 ? ' activa' : '';
      if (s.error) {
        html += '<tr class="' + activa.trim() + '" tabindex="0" data-cuota="' + c + '"><td>' + fmtMoney.format(c) + '</td><td colspan="4">No termina de pagarse</td></tr>';
      } else {
        html += '<tr class="' + activa.trim() + '" tabindex="0" data-cuota="' + c + '"><td>' + fmtMoney.format(c) + '</td><td>' + s.meses +
          '</td><td>' + fmtMoney.format(s.interes) + '</td><td>' + fmtMoney.format(s.total) +
          '</td><td>' + fmtDate.format(s.ultimo.fecha) + '</td></tr>';
      }
    });
    document.querySelector('#comparar tbody').innerHTML = html;
  }

  function actualizarHint(d, r) {
    var h = $('tasaHint');
    if (d.tipo === 'anual') {
      h.textContent = 'Equivale a ' + fmtPct.format(r * 100) + '% al mes.';
    } else {
      h.textContent = 'Equivale a ' + fmtPct.format((Math.pow(1 + r, 12) - 1) * 100) + '% al año.';
    }
  }

  function calcular() {
    var d = leer();
    var r = tasaMensual(d.tasa, d.tipo);
    actualizarHint(d, r);
    pintarComparacion(d, r);

    var res = simular(d.monto, r, d.cuota, d.base, d.offset);
    pintarAviso(res, d, r);
    if (res.error) { limpiarResultados(); return; }

    $('kMeses').textContent = res.meses + (res.meses === 1 ? ' mes' : ' meses');
    $('kMesesSub').textContent = (res.meses > 12 ? textoMeses(res.meses) + '. ' : '') + 'Último pago: ' + fmtDate.format(res.ultimo.fecha);
    $('kInteres').textContent = fmtMoney.format(res.interes);
    $('kInteresSub').textContent = fmtPct.format((res.interes / d.monto) * 100) + '% del monto prestado';
    $('kTotal').textContent = fmtMoney.format(res.total);
    $('kTotalSub').textContent = fmtMoney.format(d.monto) + ' de capital + intereses';

    var pctInt = res.total > 0 ? (res.interes / res.total) * 100 : 0;
    $('barCapital').style.width = (100 - pctInt) + '%';
    $('barInteres').style.width = pctInt + '%';
    $('legCapital').textContent = 'Capital ' + fmtMoney.format(d.monto);
    $('legInteres').textContent = 'Intereses ' + fmtMoney.format(res.interes);

    pintarCalendario(res);
  }

  function fijarCuota(valor) {
    var v = Math.max(500, Math.min(800, valor));
    el.cuota.value = v;
    el.rango.value = v;
  }

  // Eventos
  el.rango.addEventListener('input', function () { el.cuota.value = el.rango.value; calcular(); });
  el.cuota.addEventListener('input', function () {
    var v = parseFloat(el.cuota.value);
    if (isFinite(v)) el.rango.value = Math.max(500, Math.min(800, v));
    calcular();
  });
  ['monto', 'tasa', 'tipoTasa', 'fechaInicio', 'primerPago'].forEach(function (id) {
    $(id).addEventListener('input', calcular);
    $(id).addEventListener('change', calcular);
  });

  var tabla = document.querySelector('#comparar tbody');
  function elegirFila(ev) {
    var tr = ev.target.closest('tr');
    if (!tr || !tr.dataset.cuota) return;
    fijarCuota(parseFloat(tr.dataset.cuota));
    calcular();
  }
  tabla.addEventListener('click', elegirFila);
  tabla.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); elegirFila(ev); }
  });

  el.fecha.value = hoyISO();
  calcular();

  // Expuesto solo para pruebas.
  if (typeof window !== 'undefined') window.__prestamo = { simular: simular, tasaMensual: tasaMensual, finDeMes: finDeMes };
})();
