import http from 'http';
const T='127.0.0.1',TP=3002;
http.createServer((q,r)=>{
  const p=http.request({hostname:T,port:TP,path:q.url,method:q.method,headers:{...q.headers,host:T+':'+TP}},s=>{
    r.writeHead(s.statusCode,s.headers);s.pipe(r);
  });p.on('error',()=>{r.writeHead(502);r.end('502');});q.pipe(p);
}).listen(3000,'0.0.0.0',()=>console.log('OK :3000->:'+TP));
