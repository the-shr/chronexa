// In-memory only: clear on login/logout and all writes. Never persist HR data.
export function createReadCache({ttl=20000,limit=64,now=Date.now}={}) {
  const rows=new Map(),pending=new Map();let generation=0;
  return {
    clear(){generation++;rows.clear();pending.clear();},
    read(key,load){
      const cached=rows.get(key);if(cached&&cached.until>now())return Promise.resolve(cached.value);
      if(pending.has(key))return pending.get(key);
      const version=generation;
      const request=Promise.resolve().then(load).then(value=>{
        if(version===generation){if(rows.size>=limit)rows.delete(rows.keys().next().value);rows.set(key,{value,until:now()+ttl});}
        return value;
      }).finally(()=>{if(pending.get(key)===request)pending.delete(key);});
      pending.set(key,request);return request;
    }
  };
}
