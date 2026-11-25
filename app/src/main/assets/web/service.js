/* Public client configuration for the independent Météo74 services. */
(function(root){
'use strict';
const base='https://bepcgggpdtxwaifiyrah.supabase.co/functions/v1/';
const anon='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcGNnZ2dwZHR4d2FpZml5cmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1OTg5NTksImV4cCI6MjExMTE3NDk1OX0.qRCXb7lLdpZT6seIgmQ7jTRCgaPirbHSorYvrxnebwk';
const service={base,headers:{apikey:anon,Authorization:'Bearer '+anon}};
root.MeteoService=service;
if(typeof module==='object'&&module.exports)module.exports=service;
})(globalThis);
