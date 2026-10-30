import {spawn} from 'node:child_process'
import {once} from 'node:events'
import pg from 'pg'
export async function localPostgres(options){
 if(process.platform !== 'win32'){
  const {default:EmbeddedPostgres}=await import('embedded-postgres')
  return new EmbeddedPostgres(options)
 }
 const bin=await import('@embedded-postgres/windows-x64')
 const run=async(exe,args)=>{
  const child=spawn(exe,args,{windowsHide:true});let output=''
  child.stdout.on('data',v=>{output+=v});child.stderr.on('data',v=>{output+=v})
  child.on('error',()=>{})
  const [code]=await once(child,'exit')
  if(code!==0)throw new Error(output)
 }
 let server
 return {
  initialise:()=>run(bin.initdb,['-D',options.databaseDir,'-U','postgres','-A','trust','--no-locale','-E','UTF8']),
  start:()=>new Promise((resolve,reject)=>{
   server=spawn(bin.postgres,['-D',options.databaseDir,'-p',String(options.port),'-h','127.0.0.1'],{windowsHide:true})
   let output=''
   server.stderr.on('data',v=>{output+=v;if(output.includes('ready to accept connections'))resolve()})
   server.on('error',reject);server.on('exit',code=>reject(new Error(output+' exit '+code)))
  }),
  stop:()=>run(bin.pg_ctl,['-D',options.databaseDir,'-m','fast','-w','stop']),
  getPgClient:(database='postgres')=>new pg.Client({host:'127.0.0.1',port:options.port,user:'postgres',database}),
  createDatabase:async(name)=>{if(!/^[a-z_]+$/.test(name))throw new Error('Invalid test DB');const c=new pg.Client({host:'127.0.0.1',port:options.port,user:'postgres',database:'postgres'});await c.connect();try{await c.query('create database '+name)}finally{await c.end()}},
 }
}

