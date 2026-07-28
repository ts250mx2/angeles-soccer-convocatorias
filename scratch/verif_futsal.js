const http = require('http');
const get = (p) => new Promise((res,rej)=>{http.get('http://localhost:3002'+p,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej)});
const len = (j)=> j.success? j.data.length : ('ERR:'+j.message);
(async()=>{
  const T=10;
  console.log('===== ADEUDOS temp',T,'=====');
  const rs = await get(`/api/adeudos/sedes?temporadaId=${T}`);
  const S = f => rs.data.reduce((a,s)=>a+(Number(s[f])||0),0);
  console.log('RESUMEN Activos: Sedes',S('ActivosNormal'),'Keepers',S('ActivosKeepers'),'Futsal',S('ActivosFutsal'),'VentaPub',S('ActivosVentaPublico'),'Clinics',S('ActivosExcluido'),'| suma',S('ActivosNormal')+S('ActivosKeepers')+S('ActivosFutsal')+S('ActivosVentaPublico')+S('ActivosExcluido'),'raw',S('Activos'));
  for (const g of ['normal','keepers','futsal','ventapublico','excluido']) {
    console.log('  MODAL activos grupo='+g+':', len(await get(`/api/adeudos/players?filtro=activos&grupo=${g}&temporadaId=${T}`)));
  }
  // Particion de adeudo (ahora incluye futsal en el scope)
  const de=len(await get(`/api/adeudos/players?filtro=debe&temporadaId=${T}`));
  const ac=len(await get(`/api/adeudos/players?filtro=al-corriente&temporadaId=${T}`));
  const kc=len(await get(`/api/adeudos/players?filtro=keepers&temporadaId=${T}`));
  const be=len(await get(`/api/adeudos/players?filtro=becado-sin-inscripcion&temporadaId=${T}`));
  console.log('  Particion adeudo: debe',de,'+ alCorr',ac,'+ porteros',kc,'+ becados',be,'=',de+ac+kc+be,'| scope(normal+keepers+futsal)=',S('ActivosNormal')+S('ActivosKeepers')+S('ActivosFutsal'));
  console.log('===== INSCRIPCIONES temp',T,'=====');
  const ri = await get(`/api/inscripciones/sedes?temporadaId=${T}`);
  const d=ri.data;
  const S0=f=>d.filter(s=>(s.EsClinics||0)===0).reduce((a,s)=>a+(Number(s[f])||0),0);
  const ST=f=>d.reduce((a,s)=>a+(Number(s[f])||0),0);
  const aKe=S0('ActivosKeepers'),aFu=S0('ActivosFutsal'),aVP=ST('ActivosVentaPublico'),aSedes=S0('Activos')-aKe-aFu-aVP,aCli=d.filter(s=>(s.EsClinics||0)===1).reduce((a,s)=>a+(Number(s.Activos)||0),0);
  console.log('RESUMEN Activos: Sedes',aSedes,'Keepers',aKe,'Futsal',aFu,'VentaPub',aVP,'Clinics',aCli);
  console.log('RESUMEN Inscritos: total',S0('Inscritos'),'keepers',S0('InscritosKeepers'),'futsal',S0('InscritosFutsal'),'normal',S0('Inscritos')-S0('InscritosKeepers')-S0('InscritosFutsal'));
  for (const [f,g] of [['activos','normal'],['activos','keepers'],['activos','futsal'],['inscritos','normal'],['inscritos','futsal'],['bajas','futsal']]) {
    const cl=(f!=='bajas')?'&clinics=0':'';
    console.log('  MODAL '+f+' grupo='+g+':', len(await get(`/api/inscripciones/players?filtro=${f}${cl}&grupo=${g}&temporadaId=${T}`)));
  }
})().catch(e=>{console.error(e);process.exit(1)});
