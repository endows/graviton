var global = this;

var Relation = function(model, config) {
  config = config || {};
  this._model = model;
  console.log(config);
  // this._klass = global[config.klass];
  this._klass = config.klass;
  this._field = config.field;
  this._foreignKey = config.foreignKey;
};
Relation.prototype.constructor = Relation;
Relation.prototype.klass = function() {
  return Model._klasses[this._klass];
};
Relation.prototype.build = function(obj) {
  if (obj instanceof Model) return obj;
  return this.klass().build(obj);
}; 
// inserts model if it doesn't have an id - typically called by add
Relation.prototype.persist = function(model) {
  model = this.build(model);
  if (!model._id) {
    model._id = this.klass().insert(model.attributes);
    model.set('_id', model._id);
  }
  return model;
};


var ManyRelation = function(model, config) {
  Relation.prototype.constructor.apply(this, arguments);
};
ManyRelation.prototype = Object.create(Relation.prototype);
ManyRelation.prototype.constructor = ManyRelation;

ManyRelation.prototype.find = function(query) {
  return this.klass().find(_.extend(query || {}, this._filter()));
};

ManyRelation.prototype.findOne = function(query) {
  return this.klass().findOne(_.extend(query || {}, this._filter()));
};

ManyRelation.prototype.plain = function() {
  return _.map(this.all(), function(model) {
    return model.plain();
  });
};

ManyRelation.prototype.all = function() {
  return this.find().fetch();
};


// foreign key is an array ('field')
var BelongsToMany = function(model, config) {
  ManyRelation.prototype.constructor.apply(this, arguments);
  if (!model.get(this._field)) {
    model.set(this._field, []);
  }
};
BelongsToMany.prototype = Object.create(ManyRelation.prototype);
BelongsToMany.prototype.constructor = HasMany;

// foreign key is an id
var HasMany = function(model, config) {
  ManyRelation.prototype.constructor.apply(this, arguments);
};
HasMany.prototype = Object.create(ManyRelation.prototype);
HasMany.prototype.constructor = HasMany;


BelongsToMany.prototype._filter = function() {
  return {_id: {$in: this._model.get(this._field)}};
};

HasMany.prototype._filter = function() {
  var query = {};
  query[this._foreignKey] = this._model._id;
  return query;
};


ManyRelation.prototype.add = function(model) {
  if (_.isArray(model)) {
    for (var i in model) {
      this.add(model[i]);
    }
    return true;
  }
  return false;
};



BelongsToMany.prototype.add = function(model) {
  if (ManyRelation.prototype.add.apply(this, arguments)) return;

  var push = {$push: {}};
  push['$push'][this._field] = model._id;
  this._model.attributes[this._field].push(model._id);
  this._model.klass().update(this._model._id, push);
};

HasMany.prototype.add = function(model) {
  if (ManyRelation.prototype.add.apply(this, arguments)) return;

  model = this.build(model);
  model.set(this._foreignKey, this._model._id);

  Relation.prototype.persist.call(this, model);

  var set = {$set: {}};
  set['$set'][this._foreignKey] = this._model._id;
  this.klass().update(model._id, set);
};


// reverse of HasMany
// returns a function that returns one model
var belongsTo = function(model, config, name) {
  var rel = new Relation(model, config);
  return function() {
    return rel.klass().findOne(rel._model.get(rel._field));
  };
};

var embeds = function(model, config, name) {
  return function() {
    var obj = model.get(name);
    if (!obj) return;
    var rel = new Relation(model, config);
    var subModel = rel.klass().build(obj);
    subModel._parent = model;
    return subModel;
  };
};


var EmbeddedModels = function(model, config, name) {
  Relation.prototype.constructor.apply(this, arguments);
  this._name = name;
  if (!this._model.get(this._name)) this._model.set(this._name, []);
};

EmbeddedModels.prototype.add = function(model) {
  if (!model instanceof Model) {
    model = this.klass().build(model);
  }
  // var attrs = (model instanceof Model) ? model.attributes : model;
  this._model.get(this._name).push(model.attributes);
  this._model.save();
};

EmbeddedModels.prototype.plain = ManyRelation.prototype.plain;

EmbeddedModels.prototype.all = function() {
  var self = this;
  return _.map(this._objects(), function(obj) {
    var subModel = self.klass().build(obj);
    subModel._parent = self._model;
    return subModel;
  });
};

EmbeddedModels.prototype._objects = function() {
  var objs = this._model.get(this._name);
  return _.isArray(objs) ? objs : [];
};

// more efficient than embededmodels.all()[index]
EmbeddedModels.prototype.at = function(index) {
  var obj = this._objects()[index];
  if (!obj) return;
  return this.klass().build(obj);
};



Model = function(klass, obj, options) {
  options = options || {};
  this.attributes = obj;

  this._klass = klass;

  if (_.isFunction(options.initialize)) {
    options.initialize.call(this, obj);
  }

  var self = this;
  _.each(options.hasMany, function(cfg, name) {
    self[name] = new HasMany(self, cfg);
  });
  _.each(options.belongsTo, function(cfg, name) {
    self[name] = belongsTo(self, cfg, name);
  });
  _.each(options.belongsToMany, function(cfg, name) {
    self[name] = new BelongsToMany(self, cfg);
  });
  _.each(options.embeds, function(cfg, name) {
    self[name] = embeds(self, cfg, name);
  });
  _.each(options.embedsMany, function(cfg, name) {
    self[name] = new EmbeddedModels(self, cfg, name);
  });
  _.defaults(this.attributes, options.defaults);
  _.extend(this, options.properties);
};

Model._klasses = {};

// soaks nulls
// use a period-delimited string to access a deeply-nested object
Model.getProperty = function(obj, string) {
  var arr = string.split(".");
  while (obj && arr.length) {
    obj = obj[arr.shift()];
  }
  if (arr.length === 0) {
    return obj;
  }
};

Model.setProperty = function(obj, key, val) {
  var arr = key.split(".");
  while (obj && arr.length > 1) {
    key = arr.shift();
    if (_.isUndefined(obj[key])) {
      obj[key] = {};
    }
    obj = obj[key];
  }
  if (arr.length === 1) {
    obj[arr[0]] = val;
    return val;
  }
};

// use this to declare new models
// options contain the relations etc.
Model.define = function(collectionName, options) {

  var model = function(obj) {
    return new Model(collection, obj, options);
  };

  var collection = new Meteor.Collection(collectionName, {
    transform: model
  });

  // uses collection-hooks package
  if (options.timestamps && collection.before) {
    collection.before.insert(function(userId, doc) {
      if (Meteor.isServer) {
        var now = + new Date;
        doc.createdAt = now;
        doc.updatedAt = now;
      }
    });
  }

  collection.build = model;

  Model._klasses[collectionName] = collection;
  return collection;
};

Model.prototype.get = function(key) {
  return Model.getProperty(this.attributes, key);
};

Model.prototype.set = function(key, value) {
  return Model.setProperty(this.attributes, key, value);
  return this;
};

Model.prototype.plain = function() {
  return _.clone(this.attributes);
};

Model.prototype.save = function() {
  if (this._id) {
    this._klass.update(this._id, this.attributes);
  } else {
    this._id = this._klass.insert(this.attributes);
    this.set("_id", this._id);
  }
  return this;
};


// convenience
Meteor.Collection.prototype.all = ManyRelation.prototype.all;