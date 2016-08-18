# Depend.js
提供完善的依赖注入功能，让您的程序松耦合，方便维护与测试

Depend.js是一个小巧精致的js类库，可以为您的web应用提供依赖注入功能，和一系列其他的周边功能。

很遗憾Depend.js不支持IE9以下的浏览器，但是我想你也不会让一个webapp兼容IE8（笑）

以下是正文

---

Depend.js的api名称沿用了大多数人的习惯，比如service，factory，provider等等，可以让你快速入手并在你的项目中使用它。

- service

  假设你有一个函数function dependA(){/*balabala一段代码*/},你现在想将这个函数作为依赖注入到你的程序之中
  那你需要这样写


      var demo = new DI();
      demo.service('dependA', dependA);
      // 这样，准备工作就完成了，你可以在你的程序中很方便的使用dependA，就像这样：
      demo.container.dependA; // 在Depend.js内部已经完成了依赖注入的操作
  当然正常情况下肯定不会这么简单，如果你的 dependA 也依赖于其他模块，那你可以这么写：
  
      var demo = new DI();
      demo.service('dependB', dependB);
      demo.service('dependC', dependC);
      demo.service('dependA', dependA, 'dependB', 'dependC');
      // 这样，一个依赖于dependB, dependC的dependA就部署完成
      // 依旧可以使用demo.container.dependA来正常使用dependA这个依赖
      
- factory
  
  如果你需要用到更复杂的逻辑去修饰你的依赖模块，那你需要使用factory方法：
      
      var demo = new DI();
      demo.service('dependA', dependA);
      demo.factory('dependB', function(container) {
      var change = container.dependA;
      change.doSomething();       // 你可以在这里对你的依赖模块进行修饰
      return new dependB(change);
      });       // 这样，一个dependA的定制版就被注入到你的环境中，你可以通过demo.container.dependB来使用这个依赖模块

- provider

  如果前面两个方法都无法满足你的全部需求，那你就可以试试我们的终极方法provider，但是我觉得你应该不会经常使用到它
  
      var demo = new DI();
      demo.service('dependA', dependA);
      demo.service('dependB', dependB);
      demo.service('dependC', dependC);
      demo.provider('dependD', function() {
        // 你可以在这里选择你要使用的依赖模块
        // 或者对dependD进行修改
        if (happenSomething) {
            dependD.doSomething();
        }
        this.$get = function(container) {
            var changeA = container.dependA;
            var changeB = container.dependB;
            var changeC = container.dependC;
            changeA.doSomething();       // 你可以在这里对你的依赖模块进行修饰
            changeB.doSomething();       // 你可以在这里对你的依赖模块进行修饰
            changeC.doSomething();       // 你可以在这里对你的依赖模块进行修饰
            return new dependD(changeA,changeB,changeC);
          };
      });
      
