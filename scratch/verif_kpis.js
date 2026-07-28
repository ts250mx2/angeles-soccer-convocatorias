const http = require('http');
const get = (p) => new Promise((res,rej)=>{http.get('http://localhost:3002'+p,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)});
const len = (j)=> j.success? j.data.length : ('ERR:'+j.message);
(async()=>{
  const T=10;
  console.log('===== ADEUDOS temp',T,'=====');
  const rs = await get(`/api/adeudos/sedes?temporadaId=${T}`);
  const S = f => rs.data.reduce((a,s)=>a+(Number(s[f])||0),0);
  console.log('RESUMEN Activos: Sedes',S('ActivosNormal'),'Keepers',S('ActivosKeepers'),'VentaPub',S('ActivosVentaPublico'),'Clinics/Excl',S('ActivosExcluido'),'| sumaTotal',S('ActivosNormal')+S('ActivosKeepers')+S('ActivosVentaPublico')+S('ActivosExcluido'),'raw',S('Activos'));
  console.log('RESUMEN Bajas: Sedes',S('BajasNormal'),'Keepers',S('BajasKeepers'),'Clinics/Excl',S('BajasExcluido'),'| sumaTotal',S('BajasNormal')+S('BajasKeepers')+S('BajasExcluido'),'raw',S('Bajas'));
  // modal
  for (const g of ['normal','keepers','ventapublico','excluido']) {
    const j = await get(`/api/adeudos/players?filtro=activos&grupo=${g}&temporadaId=${T}`);
    console.log('  MODAL activos grupo='+g+':', len(j));
  }
  console.log('===== INSCRIPCIONES temp',T,'=====');
  const ri = await get(`/api/inscripciones/sedes?temporadaId=${T}`);
  const d = ri.data;
  const S0 = f => d.filter(s=>(s.EsClinics||0)===0).reduce((a,s)=>a+(Number(s[f])||0),0);
  const ST = f => d.reduce((a,s)=>a+(Number(s[f])||0),0);
  const aKe=S0('ActivosKeepers'), aVP=ST('ActivosVentaPublico'), aSedes=S0('Activos')-aKe-aVP;
  const aCli=d.filter(s=>(s.EsClinics||0)===1).reduce((a,s)=>a+(Number(s.Activos)||0),0);
  console.log('RESUMEN Activos: Sedes(normal)',aSedes,'Keepers',aKe,'VentaPub',aVP,'Clinics',aCli);
  console.log('RESUMEN Inscritos: total',S0('Inscritos'),'keepers',S0('InscritosKeepers'),'normal',S0('Inscritos')-S0('InscritosKeepers'));
  console.log('RESUMEN Bajas: total',ST('Bajas'),'keepers',ST('BajasKeepers'),'normal',ST('Bajas')-ST('BajasKeepers'));
  for (const [f,g] of [['inscritos','normal'],['inscritos','keepers'],['activos','normal'],['activos','keepers'],['activos','ventapublico'],['bajas','normal'],['bajas','keepers']]) {
    const cl = (f==='inscritos'||f==='activos') && g!=='ventapublico' ? '&clinics=0' : '';
    const j = await get(`/api/inscripciones/players?filtro=${f}${cl}&grupo=${g}&temporadaId=${T}`);
    console.log('  MODAL '+f+' grupo='+g+':', len(j));
  }
})().catch(e=>{console.error(e);process.exit(1)});
