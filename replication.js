Fiber = Npm.require('fibers')

let debug = (m) => {
  if(process.env.NODE_ENV === "development")
    console.log('Alt:Replication: ' + m)
}

let error = (e, prefix) => {
  let p = ''
  if(prefix)
    p = prefix + ': '
  let m = e
  if(e.message)
    m = e.message
  if(e.stack)
    m = m + '\n' + e.stack
  console.log('Alt:Replication: ' + p + m)
}

let sleep = (ms) => {
    let fiber = Fiber.current
    if(fiber){
      setTimeout(() => { fiber.run() }, ms)
      Fiber.yield()
    }else{
      console.log('ERROR: sleep - not in fiber')
    }
}


let shadow = []
let currentSync = null
let currentModifications = {}
let useFastCount = !process.env.DISABLE_FAST_COUNT

Meteor.Replication = (name, ds, ...args) => {
  let collection = new Mongo.Collection(name, {connection: null})
  let haveDocs = useFastCount && !!collection._collection && !!collection._collection._docs
  let docs = haveDocs ? collection._collection._docs : null

  shadow.push({
    name: name,
    primaryKey: ds.primaryKey,
    query: Meteor.wrapAsync(ds.connection[ds.method], ds.connection),
    args: args,
    collection: collection,
    docs: docs,
    delayMS: ds.delaySeconds > 10 ? ds.delaySeconds * 1000 : 10000,
    lastUpdate: null
  })

  collection.modify = (ids, callback) => {
    if(!(ids instanceof Array))
      ids = [ids]
    if(currentSync && currentSync == name){
      for(let i = 0; i < ids.length; i++)
        currentModifications[ids[i]] = true
    }
    callback()
  }

  return collection
}

Meteor.Replication.DataSource = (connection, method, delaySeconds) => {
  let ds = {
    connection: connection,
    method: !!method ? method : 'query',
    primaryKey: 'id',
    delaySeconds: !!delaySeconds ? delaySeconds : 10,
    id(k){
      this.primaryKey = k
      return this
    }
  }

  return ds
}


Meteor.startup(() => {

  Fiber(() =>{
    while(true){
      for(let si = 0; si < shadow.length; si++){
        let s = shadow[si]
        let currentDateMS = Date.now()

        if(!s.lastUpdate || currentDateMS - s.delayMS > s.lastUpdate){
          s.lastUpdate = currentDateMS
          currentSync = s.name
          try{
            let args = s.args
            let rows = s.query(...args)
            let updateCount = 0
            let rIdMap = {}

            for(let i = 0; i < rows.length; i++){
              if(i % 500 == 0)
                sleep(10) // play nice with other fibers

              let r = rows[i]
              let k = r[s.primaryKey]
              rIdMap[k] = true

              if(checkUpdate(s, r)){
                s.collection.upsert({_id: k}, {$set: r})
                updateCount++
              }
            }
            if(updateCount > 0)
              debug(s.name + ' updated records: ' + updateCount)

            if(checkDelete(s, rows)){
              let toDelete = []

              // this blocks but no other way
              s.collection.find({}, {fields: {_id: 1}}).forEach((r) => {
                if(!rIdMap[r._id] && !currentModifications[r._id])
                  toDelete.push(r._id)
              })

              for(let i = 0; i < toDelete.length; i++){
                if(i % 500 == 0)
                  sleep(10) // play nice with other fibers
                s.collection.remove(toDelete[i])
              }

              if(toDelete.length > 0)
                debug(s.name + ' deleted records: ' + toDelete.length)
            }
          }catch(e){ error(e, s.name) }
          currentSync = null
          currentModifications = {}
        }
        sleep(10)
      }
      sleep(10)
    }
  }).run()

})


let checkUpdate = (s, r) => {
  let key = r[s.primaryKey]

  if(currentModifications[key])
    return false // modified out of band so don't override

  let cr = s.collection.findOne({_id: key})

  if(!cr){
    return true // insert
  }

  let doUpdate = false
  for(f in r){
    if(r.hasOwnProperty(f)){
      if('' + r[f] != '' + cr[f]){
        doUpdate = true
      }
    }
  }
  return doUpdate
}

let checkDelete = (s, rows) => {
  if(!s.docs)
    return(s.collection.find().count() != rows.length)

  return(s.docs.size() != rows.length)
}


// Speed up deletion detection in local collection
if(useFastCount){
  console.log('Alt:Replication: using fast count')
  IdMap.prototype._clone = IdMap.prototype.clone

  IdMap.prototype.set = function(id, value){
    let c = this._count ? this._count : 0
    let key = this._idStringify(id)
    if(!this._map[key])
      this._count = c + 1
    this._map[key] = value
  }

  IdMap.prototype.setDefault = function(id, def){
    let c = this._count ? this._count : 0
    let key = this._idStringify(id)
    if(this._map[key])
      return this._map[key]
    this._count = c + 1
    this._map[key] = def
    return def
  }

  IdMap.prototype.remove = function(id){
    let c = this._count ? this._count : 0
    let key = this._idStringify(id)
    if(this._map[key]){
      this._count = c - 1
      delete this._map[key]
    }
  }

  IdMap.prototype.clear = function(){
    this._count = 0
    this._map = {}
  }

  IdMap.prototype.clone = function(){
    let c = IdMap.prorotype._clone.call(this)
    c._count = this._count
    return c
  }

  IdMap.prototype.size = function(){
    return this._count ? this._count : 0
  }
}


