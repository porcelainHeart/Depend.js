(function() {

    // 初始化变量
    var fullNameMap = [],
        decorators  = [],
        providerMap = [],
        nestedDIs   = [],
        deferred    = [],
        middles     = [],
        depends     = {},
        id          = 0;

    // 缓冲器
    function reducer(instance, func) {
        return func(instance);
    }
    // curry化concat
    function concatIterator(a, b) {
        return a.concat(b);
    }

    // 获取依赖信息
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

    function allMap(collection, id, name) {
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

    // factory主函数
    function factory(name, Factory) {
        return provider.call(this, name, function GenericProvider() {
            this.$get = Factory;
        });
    }

    function byMethod(name) {
        return !/^\$(?:register|list)$|Provider$/.test(name);
    }

    function list(container) {
        return Object.keys(container || this.container || {}).filter(byMethod);
    }

    function byMiddle(id, name, instance, container) {
        var middleware = allMap(middles, id, name);
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

    // provider主函数
    function provider(fullName, Provider) {
        var parts, providers, name, factory;
        providers = get(providerMap, this.id);
        parts = fullName.split('.');

        // 如果该依赖已经注入，向控制台报错并不执行构造器
        if (providers[fullName] && parts.length === 1 && !this.container[fullName + 'Provider']) {
            return console.error(fullName + ' provider already instantiated.');
        }

        // 标记为true避免重复运行构造器
        providers[fullName] = true;

        // 弹出parts[0]方便为构造器传参，同时方便判断是否链式依赖
        name = parts.shift();

        // 单个依赖调用createProvider构造器，链式依赖调用createSubProvider构造器
        factory = parts.length ? createSubProvider : createProvider;

        // 如果是单个依赖则只接收前两个参数
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
                    instance = allMap(decorators, id, name)
                        .reduce(reducer, provider.$get(container));

                    delete container[providerName];
                    delete container[name];
                }
                return instance === undefined ? instance : byMiddle(id, name, instance, container);
            }
        };

        Object.defineProperties(container, properties);
        return this;
    }

    function createSubProvider(name, Provider, fullName, parts) {
        var depend, depends, subName, id;

        id = this.id;
        depends = get(nestedDIs, id);
        depend = depends[name];
        if (!depend) {
            this.container[name] = (depend = depends[name] = DI.pop()).container;
        }
        subName = parts.join('.');
        depend.provider(subName, Provider);

        set(fullNameMap, depend.id, subName, { fullName : fullName, id : id });

        return this;
    }

    function register(Obj) {
        var value = Obj.$value === undefined ? Obj : Obj.$value;
        return this[Obj.$type || 'service'].apply(this, [Obj.$name, value].concat(Obj.$inject || []));
    }

    function resolve(data) {
        get(deferred, this.id, '__global__').forEach(function (func) {
            func(data);
        });

        return this;
    }

    // service主函数
    function service(name, Service) {
        var deps = arguments.length > 2 ? Array.prototype.slice.call(arguments, 2) : null;
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

    function setValueObject(container, name) {
        var cont = container[name];
        if (!cont) {
            cont = {};
            defineValue.call(container, name, cont);
        }
        return cont;
    }

    function defineValue(name, val) {
        Object.defineProperty(this, name, {
            configurable : true,
            enumerable : true,
            value : val,
            writable : true
        });
    }

    // 容器构造函数
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

    // 对外暴露的api接口
    DI.prototype = {
        decorator : decorator,
        factory : factory,
        middleware : middleware,
        provider : provider,
        service : service
    };

    DI.pop = pop;
    DI.list = list;

    // 严格模式设置
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

        // 在node.js或浏览器环境下就将freeGlobal赋值给that
        if (freeGlobal && (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal)) {
            that = freeGlobal;
        }

        // require.js的AMD模块加载
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