Package.describe({
  name: 'emmerge:graviton',
  summary: "Transform collection records into Models and define and use relationships between Meteor collections",
  git: "https://github.com/emmerge/graviton",
  version: '0.0.17'
});

Package.on_use(function (api, where) {

  if (api.versionsFrom) { // 0.9.0+ litmus test
    api.versionsFrom("0.9.1");
    api.use('mongo', ['client', 'server']);
  }

  api.use(['underscore', 'minimongo', 'peerlibrary:async@0.9.2_1'], ['client', 'server']);
  api.add_files(['lib/relations.js', 'lib/model.js', 'graviton.js'], ['client', 'server']);

  if (typeof api.export !== 'undefined') {
    api.export("Graviton", ["client", "server"]);
  }
});

Package.on_test(function (api) {
  api.use(['mongo', 'underscore', 'emmerge:graviton', 'tinytest', 'test-helpers']);

  api.add_files([
    'test/test-helpers.js',
    'test/relation-test.js',
    'test/model-test.js',
    'test/legacy-test.js',
    'test/extension-test.js',
    'test/packages-test.js',
    'test/incomplete-relation-configs.js',
    'test/unit-test.js'
  ],
  ['client', 'server']);
});


