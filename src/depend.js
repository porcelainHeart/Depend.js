(function() {
    var id = 0,
        fullNameMap = [],
        decorators = [],
        deferred = [],
        middles = [],
        depends = {},
        nestedDIs = [],
        providerMap = [],
        slice = Array.prototype.slice;

    function concatIterator(a, b) {
        return a.concat(b);
    }

    function get(collection, id, name) {
        var group = collection[id];
        if (!group) {
            group = collection[id] = {};
        }
        if (name && !group[name]) {
            group[name] = [];
        }
        return name ? group[name] : group;
    }

    function getAllWithMapped(collection, id, name) {
        return get(fullNameMap, id, name)
            .map(getMapped.bind(null, collection))
            .reduce(concatIterator, get(collection, id, name))
            .concat(get(collection, id, '__global__'));
    }

    function getMapped(collection, data) {
        return get(collection, data.id, data.fullName);
    }

    function getNested(obj, prop) {
        var service = obj[prop];
        if (service === undefined && globalConfig.strict) {
            throw new Error('DI was unable to resolve a service.  `' + prop + '` is undefined.');
        }
        return service;
    }

    function getNestedService(fullName) {
        return fullName.split('.').reduce(getNested, this);
    }

    function set(collection, id, name, func) {
        if (typeof name === 'function') {
            func = name;
            name = '__global__';
        }
        get(collection, id, name).push(func);
    }

    function constant(name, value) {
        var parts = name.split('.');
        name = parts.pop();
        defineConstant.call(parts.reduce(setValueObject, this.container), name, value);
        return this;
    }

    function defineConstant(name, value) {
        Object.defineProperty(this, name, {
            configurable : false,
            enumerable : true,
            value : value,
            writable : false
        });
    }

    function decorator(name, func) {
        set(decorators, this.id, name, func);
        return this;
    }

    function defer(func) {
        set(deferred, this.id, func);
        return this;
    }

    function digest(services) {
        return (services || []).map(getNestedService, this.container);
    }

    function factory(name, Factory) {
        return provider.call(this, name, function GenericProvider() {
            this.$get = Factory;
        });
    }

    function instanceFactory(name, Factory) {
        return factory.call(this, name, function GenericInstanceFactory(container) {
            return {
                instance : Factory.bind(Factory, container)
            };
        });
    }

    function byMethod(name) {
        return !/^\$(?:register|list)$|Provider$/.test(name);
    }

    function list(container) {
        return Object.keys(container || this.container || {}).filter(byMethod);
    }

    function applyMiddleware(id, name, instance, container) {
        var middleware = getAllWithMapped(middles, id, name);
        var descriptor = {
            configurable : true,
            enumerable : true
        };
        if (middleware.length) {
            descriptor.get = function getWithMiddlewear() {
                var index = 0;
                var next = function nextMiddleware(err) {
                    if (err) {
                        throw err;
                    }
                    if (middleware[index]) {
                        middleware[index++](instance, next);
                    }
                };
                next();
                return instance;
            };
        } else {
            descriptor.value = instance;
            descriptor.writable = true;
        }

        Object.defineProperty(container, name, descriptor);

        return container[name];
    }

    function middleware(name, func) {
        set(middles, this.id, name, func);
        return this;
    }

    function pop(name) {
        var instance;
        if (name) {
            instance = depends[name];
            if (!instance) {
                depends[name] = instance = new DI();
                instance.constant('DI_NAME', name);
            }
            return instance;
        }
        return new DI();
    }

    function reducer(instance, func) {
        return func(instance);
    }

    function provider(fullName, Provider) {
        var parts, providers, name, factory;
        providers = get(providerMap, this.id);
        parts = fullName.split('.');
        if (providers[fullName] && parts.length === 1 && !this.container[fullName + 'Provider']) {
            return console.error(fullName + ' provider already instantiated.');
        }
        providers[fullName] = true;

        name = parts.shift();
        factory = parts.length ? createSubProvider : createProvider;

        return factory.call(this, name, Provider, fullName, parts);
    }

    function createProvider(name, Provider) {
        var providerName, properties, container, id;

        id = this.id;
        container = this.container;
        providerName = name + 'Provider';

        properties = Object.create(null);
        properties[providerName] = {
            configurable : true,
            enumerable : true,
            get : function getProvider() {
                var instance = new Provider();
                delete container[providerName];
                container[providerName] = instance;
                return instance;
            }
        };

        properties[name] = {
            configurable : true,
            enumerable : true,
            get : function getService() {
                var provider = container[providerName];
                var instance;
                if (provider) {
                    instance = getAllWithMapped(decorators, id, name)
                        .reduce(reducer, provider.$get(container));

                    delete container[providerName];
                    delete container[name];
                }
                return instance === undefined ? instance : applyMiddleware(id, name, instance, container);
            }
        };

        Object.defineProperties(container, properties);
        return this;
    }

    function createSubProvider(name, Provider, fullName, parts) {
        var depend, depends, subname, id;

        id = this.id;
        depends = get(nestedDIs, id);
        depend = depends[name];
        if (!depend) {
            this.container[name] = (depend = depends[name] = DI.pop()).container;
        }
        subname = parts.join('.');
        depend.provider(subname, Provider);

        set(fullNameMap, depend.id, subname, { fullName : fullName, id : id });

        return this;
    }

    function register(Obj) {
        var value = Obj.$value === undefined ? Obj : Obj.$value;
        return this[Obj.$type || 'service'].apply(this, [Obj.$name, value].concat(Obj.$inject || []));
    }

    function resolve(data) {
        get(deferred, this.id, '__global__').forEach(function deferredIterator(func) {
            func(data);
        });

        return this;
    }

    function service(name, Service) {
        var deps = arguments.length > 2 ? slice.call(arguments, 2) : null;
        var depend = this;
        return factory.call(this, name, function GenericFactory() {
            if (deps) {
                deps = deps.map(getNestedService, depend.container);
                deps.unshift(Service);
                Service = Service.bind.apply(Service, deps);
            }
            return new Service();
        });
    }

    function value(name, val) {
        var parts;
        parts = name.split('.');
        name = parts.pop();
        defineValue.call(parts.reduce(setValueObject, this.container), name, val);
        return this;
    }

    function setValueObject(container, name) {
        var nestedContainer = container[name];
        if (!nestedContainer) {
            nestedContainer = {};
            defineValue.call(container, name, nestedContainer);
        }
        return nestedContainer;
    }

    function defineValue(name, val) {
        Object.defineProperty(this, name, {
            configurable : true,
            enumerable : true,
            value : val,
            writable : true
        });
    }

    function DI(name) {
        if (!(this instanceof DI)) {
            return DI.pop(name);
        }

        this.id = id++;
        this.container = {
            $register : register.bind(this),
            $list : list.bind(this)
        };
    }

    DI.prototype = {
        constant : constant,
        decorator : decorator,
        defer : defer,
        digest : digest,
        factory : factory,
        instanceFactory: instanceFactory,
        list : list,
        middleware : middleware,
        provider : provider,
        register : register,
        resolve : resolve,
        service : service,
        value : value
    };

    DI.pop = pop;
    DI.list = list;

    var globalConfig = DI.config = {
        strict : false
    };
    

    (function exportDI(that) {

        // 在Node.js环境下freeExports为exports，否则为false
        var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;

        // 在Node.js环境下freeModule为module，否则为false
        var freeModule = typeof module == 'object' && module && !module.nodeType && module;

        // 确定module.exports存在并赋值给moduleExports，否则返回false
        var moduleExports = freeModule && freeModule.exports === freeExports && freeExports;

        // 确认global全局对象是否存在并赋值给freeGlobal
        var freeGlobal = typeof global == 'object' && global;
        
        if (freeGlobal && (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal)) {
            that = freeGlobal;
        }

        
        if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
            that.DI = DI;
            define(function() { return DI; });
        } else if (freeExports && freeModule) {
            if (moduleExports) {
                (freeModule.exports = DI).DI = DI;
            } else {
                freeExports.DI = DI;
            }
        } else {
            that.DI = DI;
        }
    }((typeof window =='object' && window) || this));
    
}.call(this));