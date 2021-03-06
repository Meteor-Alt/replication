Package.describe({
  name: 'alt:replication',
  version: '1.0.2',
  summary: 'Sync data into collections from external sources like MySql or REST.',
  git: 'https://github.com/Meteor-Alt/replication.git',
  documentation: 'README.md'
})

Package.onUse(function(api) {
  api.versionsFrom('1.2.1')
  api.use(['ecmascript', 'id-map', 'mongo@1.1.3'], 'server')
  api.addFiles('replication.js', 'server')
})

