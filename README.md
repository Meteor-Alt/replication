# Replication

A replication is a Meteor collection that synchronizes with an external source.  The synchronization is done by a configurable polling time and is one way.  Any changes made directly to the replication will be overwritten on the next sync.

# Usage

```
meteor add alt:replication
```

Set up a data source for the replication

```
MySql = Npm.require('mysql')

let pool = MySql.createPool({
  connectionLimit:2,
  host: 'localhost',
  database: 'mydb',
  user: 'test',
  password: 'password'
})

let ds = Meteor.Replication.DataSource(pool)
```

Create replications using the data source

```
let Products = Meteor.Replication('products', ds, 'select * from catalog')
```

Publish a dataset just like with any Meteor collection

```
Meteor.publish('active_products', () => {
  return Products.find({status: 'active'}, {fields: {name: 1, price: 1, desc: 1}})
})
```

To update the data you need to update the external data and optionally server and client collections

```
Meteor.methods({
  updateProductPrice(id, price){
    pool.query('update catalog set price = ? where id = ?', [price, id], (err, result) => {
      if(!err)
        Products.update({_id: id}, {$set: {price: price}})
    }
  }
})
```

# Configuration

**Meteor.Replication.DataSource(connection [, method [, delay ]] )**

| Parameter | Description |
| --- | --- |
| connection | object that handles retrieving data from external source |
| method | method on connection to call (defaults to 'query') |
| delay | minimum number of seconds between sync polls (defaults to 10 seconds) |

The method of the connection object is expected to be asynchronous and require a callback as it's last parameter.
The callback receives 2 parameters (err, data).

**Meteor.Replication( name, data_source, ...args )**

| Parameter | Description |
| --- | --- |
| name | collection name |
| data_source | instance of Meteor.Replication.DataSource |
| ...args | any number of arguments passed to the datasource method |

The rows are assumed to have 'id' as the primary key.  Use the id method of DataSource to set a different primary key for each replication.

```
let Products = Meteor.Replication('products', ds.id('partNum'), 'select * from catalog')
let Orders = Meteor.Replication('orders', ds.id('orderNum'), 'select * from orders where state = ?', ['pending'])
```
