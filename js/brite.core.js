//TODO: needs to make it "reload safe"
var brite = brite || {};

// ---------------------- //
// ------ brite ------ //

/**
 * @namespace brite is used to managed the lifescycle of UI components (create, display, and destroy)
 * 
 */
(function($) {

	var _componentDefStore = {};

	// when loading a component, we put a promise in this map
	var _deferredByComponentName = {};

	var _transitions = {};

	// ------ Public API: Component Management ------ //

	/**
	 * MUST be called to register the component
	 * 
	 * @param {String}
	 *            name the name of the component
	 * 
	 * @param {config}
	 *            config a config object
	 * 
	 * @param {String|jQuery}
	 *            config.parent jquery selector, html element, jquery object (if not set, the the element will not be
	 *            added in the rendering logic). <br />
	 *            Note 1) If ctx.parent is absent from the component definition and from this method call, the brite
	 *            will not append the returned element to the DOM. So, if ctx.parent is null, then the create() must
	 *            take care of adding the elements to the DOM. However, the postDisplay will still be called.
	 * @param {String}
	 *            config.animation (experimental) the animation ("fromLeft" , "fromRight", or null) (default undefined)
	 * @param {String|jQuery}
	 *            config.replace jquery selector string, html element, or jquery object (default undefined) of the
	 *            element to be replaced
	 * @param {Boolean}
	 *            config.emptyParent if set/true will call empty() on the parent before adding the new element (default
	 *            false). Valid only if no transition and build return an element
	 * @param {Boolean}
	 *            config.unique if true, the component will be display only if there is not already one component with
	 *            the same name in the page.
	 * 
	 * @param {Object|Function}
	 *            componentFactory (Required) Factory function or "object template" that will be used to create the
	 *            object instance. If componentFactory is a plain object, the "object template" will be cloned to create
	 *            the component instance. If it is a function, it will be called and a component instance object will be
	 *            exptected as return value.<br />
	 *            <br />
	 * 
	 * A "Component" object can have the following methods <br />
	 * <br />
	 * component.create(data,config): (required) function that will be called with (data,config) to build the
	 * component.$element.<br />
	 * component.init(data,config): (optional) Will be called just after the create and the component instance has been
	 * initialized. <br />
	 * component.postDisplay(data,config): (optional) This method will get called with (data,config) after the component
	 * has been created and initialized (postDisplay is deferred for performance optimization) <br />
	 * Since this call will be deferred, it is a good place to do non-visible logic, such as event bindings.<br />
	 * component.destroy() (optional) This will get called when $.bRemove or $.bEmpty is called on a parent (or on the
	 * element for $.bRemove). It will get called before this component htmlElement will get removed<br />
	 * component.postDestroy() (optional) This will get called when $.bRemove or $.bEmpty is called on a parent (or on
	 * the element for $.bRemove). It will get called after this component htmlElement will get removed<br />
	 * 
	 */
	brite.registerComponent = function(name, config, componentFactory) {
		var def = {};
		def.name = name;
		def.componentFactory = componentFactory;
		def.config = config;
		_componentDefStore[name] = def;

		var deferred = _deferredByComponentName[name];
		if (deferred) {
			deferred.resolve(def);
			delete _deferredByComponentName[name];
		}
	};

	/**
	 * This just instantiate a new component for a given name. This is useful for manipulating the component off
	 * lifecycle for performance. For example, sometime building a component and displaying in the background (with
	 * z-index) allow the browser to do its caching magic, and can speed up the first appearance of the component when
	 * it is due.
	 * 
	 * @param {string}
	 *            name
	 */
	brite.instantiateComponent = function(name) {
		var loaderDeferred = loadComponent(name);
		return instantiateComponent(componentDef);
	}
	// ------ /Public API: Component Management ------ //

	// ------ Public API: Transition Management ------ //
	brite.registerTransition = function(name, transition) {
		_transitions[name] = transition;
	}

	brite.getTransition = function(name) {
		return _transitions[name];
	}
	// ------ /Public API: Transition Management ------ //

	// ------ Public API: Display Management ------ //

	/**
	 * This will create, init, and display a new component. It will load the component on demand if needed.
	 * 
	 * @param {String}
	 *            name (required) the component name
	 * @param {Object}
	 *            data (optional, required if config) the data to be passed to the build and postDisplay.
	 * @param {Object}
	 *            config (optional) config override the component's config (see {@link brite.registerComponent} config
	 *            params for description)
	 * @return {Component} return the component instance.
	 */
	brite.display = function(componentName, data, config) {
		return process(componentName, data, config);
	};

	/**
	 * Same as brite.display but bypass the build() step (postDisplay() will still be called). So, this will create a
	 * new component and attach it to the $element and call postDisplay on it.
	 * 
	 */
	brite.attach = function(componentName, $element, data, config) {
		return process(componentName, data, config, $element);
	}
	// ------ /Public API: Display Management ------ //

	// ------ Public Properties: Config ------ //
	/**
	 * Config for the brite module.
	 * <ul>
	 * <li><span class="light fixedFont">{String|jQuery}</span> <strong>config.componentsHTMLHolder</strong>
	 * (default: "body") jQuery selector or object pointing to the element that will be used to add the loaded component
	 * HTML.</li>
	 * </ul>
	 * 
	 */
	brite.config = {

		componentsHTMLHolder : "body",
		componentsPath : "components/"
	}

	brite.defaultComponentConfig = {
		emptyParent : false,
		postDisplayDelay : 0
	}
	// ------ /Public Properties: Config ------ //

	/**
	 * Return the promise().<br />
	 * 
	 * <ul>
	 * <li>It will load the component only if it not already loaded</li>
	 * 
	 * <li>As of now, the component is loaded by loading (via sync-AJAX class) and adding the "components/[name].html"
	 * content to the "body" (can be overriden with brite.config.componentsHTMLHolder)</li>
	 * 
	 * <li> So, developers need to make sure of the following:<br /> - the "component/[name].html" exists (relative to
	 * the current page) and does not contain any visible elements <br /> - the "component/[name].html" will call the
	 * briteui.registerComponent([name],componentDef) <br />
	 * </li>
	 * </ul>
	 * <br />
	 * TODO: Needs to make the the component
	 * 
	 * @param {Object}
	 *            name component name (no space or special character)
	 * @return The loaderDeferred
	 */
	function loadComponent(name) {
		var loaderDeferred = $.Deferred();

		var componentDef = _componentDefStore[name];

		// if the component already exist, just return it.
		if (componentDef) {
			loaderDeferred.resolve(componentDef);
		}
		// if the component is not loaded, load it
		else {
			var currentLoaderDeferred = _deferredByComponentName[name];
			// if there is already a loading going on, replace the loaderDeferred to be returned by the
			// currentLoaderDeferred
			if (currentLoaderDeferred) {
				loaderDeferred = currentLoaderDeferred;
			}
			// otherwise, do the loading
			else {
				_deferredByComponentName[name] = loaderDeferred;
				$.ajax({
					url : brite.config.componentsPath + name + ".html",
					async : true
				}).complete(function(jqXHR, textStatus) {
					$(brite.config.componentsHTMLHolder).append(jqXHR.responseText);
				});
			}
		}
		return loaderDeferred.promise();
	}
	;

	// if $element exist, then, bypass the create
	function process(name, data, config, $element) {
		var loaderDeferred = loadComponent(name);

		var processDeferred = $.Deferred();

		var createDeferred = $.Deferred();
		var initDeferred = $.Deferred();
		var postDisplayDeferred = $.Deferred();

		var processPromise = processDeferred.promise();
		processPromise.whenCreate = createDeferred.promise();
		processPromise.whenInit = initDeferred.promise();
		processPromise.whenPostDisplay = postDisplayDeferred.promise();

		loaderDeferred.done(function(componentDef) {
			config = buildConfig(componentDef, config);
			var component = instantiateComponent(componentDef);

			// If the config.unique is set, and there is a component with the same name, we resolve the deferred now
			// NOTE: the whenCreate and whenPostDisplay won't be resolved again
			// TODO: an optimization point would be to add a "bComponentUnique" in the class for data-bcomponent that
			// have a confi.unique = true
			// This way, the query below could be ".bComponentUnique [....]" and should speedup the search significantly
			// on UserAgents that supports the getElementsByClassName
			if (config.unique) {
				var $component = $("[data-bcomponent='" + name + "']");
				if ($component.length > 0) {
					component = $component.bComponent();
					processDeferred.resolve(component);
					return processDeferred;
				}
			}

			// ------ create ------ //
			var deferred$element = $.Deferred();
			// if there is no element, we invoke the build
			if (!$element) {
				// Ask the component to create the new $element
				var createReturn = invokeCreate(component, data, config);
				// if it custom Deferred, then, assume it will get resolved with the $element (as by the API contract)
				if (createReturn && $.isFunction(createReturn.promise) && !createReturn.jquery) {
					// FIXME: will need to use the new jQuery 1.6 pipe here (right now, just trigger on done
					createReturn.done(function($element) {
						deferred$element.resolve($element);
					}).fail(function() {
						deferred$element.reject();
					});
				}
				// otherwise, if the $element is returned , resolve the deferred$element immediately
				else {
					if (createReturn) {
						$element = $(createReturn);
					}
					deferred$element.resolve($element);
				}
			}
			// if the $element is already here, then, it is an attach, so, do a immediate Deffered
			else {
				deferred$element.resolve($element);
			}
			// ------ /create ------ //

			// ------ render & resolve ------ //
			deferred$element.promise().done(function($element) {
				// if there is an element, then, manage the rendering logic.
				if ($element) {
					// make sure we get the jQuery object
					$element = $($element);

					bind$element($element, component, data, config);

					// attached the componentPromise to this $element, this way, during rendering sub component can sync
					// with it.
					$element.data("componentProcessPromise", processPromise);

					createDeferred.resolve(component);

					$.when(invokeInit(component, data, config)).done(function() {
						// render the element
						// TODO: implement deferred for the render as well.
						renderComponent(component, data, config);

						initDeferred.resolve(component);

					});

				} else {
					// TODO: need to look if we need this. Basically, that allow to have create methods that do/return
					// nothing but still instantiate the component
					createDeferred.resolve(component);

					// TODO: probably need to invokeInit in thi scase as well. For now, just resolve the initDeferred
					initDeferred.resolve(component);

				}

				processPromise.whenInit.done(function() {
					var parentComponentProcessPromise, invokePostDisplayDfd;

					// if there is a parent component, then need to wait until it display to display this one.
					if ($element && $element.parent()) {
						var parentComponent$Element = $element.parent().closest("[data-bcomponent]");

						if (parentComponent$Element.length > 0) {
							parentComponentProcessPromise = parentComponent$Element.data("componentProcessPromise");
							if (parentComponentProcessPromise){
								parentComponentProcessPromise.whenPostDisplay.done(function() {
									invokePostDisplayDfd = invokePostDisplay(component, data, config);
									invokePostDisplayDfd.done(function() {
										postDisplayDeferred.resolve(component);
									});
								});
							}
						}
					}

					// if we did not have any parentComponentProcessPromise, then, just invoke
					if (!parentComponentProcessPromise) {
						invokePostDisplayDfd = invokePostDisplay(component, data, config);
						invokePostDisplayDfd.done(function() {
							postDisplayDeferred.resolve(component);
						});
					}

				});

			});
			// ------ /render & resolve ------ //
			// console.log
			processPromise.whenPostDisplay.done(function() {
				processDeferred.resolve(component);
			});
		});

		return processPromise;
	}

	function renderComponent(component, data, config) {

		if (config.transition) {
			var transition = brite.getTransition(config.transition);

			if (transition) {
				transition(component, data, config);
			} else {
				brite.log.error("Transition [" + config.transition + "] not found. Transitions need to be registered via brite.registerTranstion(..) before call.");
			}
		}
		// if no transition remove/show
		else {
			if (config.replace) {
				$(config.replace).bRemove();
			}

			// note: if there is no parent, then, the sUI.diplay caller is reponsible to add it
			if (config.parent) {
				if (config.emptyParent) {
					$(config.parent).bEmpty();
				}
				$(config.parent).append(component.$element);
			}
		}

	}
	;

	// ------ Private Helpers ------ //
	// build a config for a componentDef
	function buildConfig(componentDef, config) {
		var instanceConfig = $.extend({}, this.defaultComponentConfig, componentDef.config, config);
		instanceConfig.componentName = componentDef.name;
		return instanceConfig;
	}

	function instantiateComponent(componentDef) {
		var component;
		var componentFactory = componentDef.componentFactory;
		if (componentFactory) {
			// if it is a function, call it, it should return a new component object
			if ($.isFunction(componentFactory)) {
				component = componentFactory();
			}
			// if it is a plainObject, then, we clone it (NOTE: We do a one level clone)
			else if ($.isPlainObject(componentFactory)) {
				component = $.extend({}, componentFactory);
			} else {
				brite.log.error("Invalid ComponentFactory for component [" + componentDef.componentName
						+ "]. Only types Function or Object are supported as componentFactory. Empty component will be created.");
			}
		} else {
			brite.log.error("No ComponentFactory for component [" + componentDef.componentName + "]");
		}

		if (component) {
			component.name = componentDef.name;
		}
		return component;
	}

	function invokeCreate(component, data, config) {
		// backward compatibility
		var createFunc = component.create || component.build;
		// assert that we have a build method
		if (!createFunc || !$.isFunction(createFunc)) {
			brite.log.error("Invalid 'create' function for component [" + component.name + "].");
			return;
		}
		return createFunc.call(component, data, config);
	}

	function invokeInit(component, data, config) {
		var initFunc = component.init;
		if ($.isFunction(initFunc)) {
			return initFunc.call(component, data, config);
		}
	}
	// 
	function bind$element($element, component, data, config) {
		component.$element = $element;
		$element.data("component", component);

		$element.attr("data-bcomponent", config.componentName);
	}

	function invokePostDisplay(component, data, config) {
		var invokeDfd = $.Deferred();

		// Call the eventual postDisplay
		// (differing for performance)
		if (component.postDisplay) {
			// if the component has a delay >= 0, then, we use a setTimeout
			if (config.postDisplayDelay >= 0) {
				setTimeout(function() {
					var postDisplayDfd = component.postDisplay(data, config);
					if (postDisplayDfd && $.isFunction(postDisplayDfd)) {
						postDisplayDfd.done(function() {
							invokeDfd.resolve();
						});
					} else {
						invokeDfd
					}
				}, config.postDisplayDelay);
			}
			// otherwise, we call it in sync
			else {

				var postDisplayDfd = component.postDisplay(data, config);
				if (postDisplayDfd && $.isFunction(postDisplayDfd)) {
					postDisplayDfd.done(function() {
						invokeDfd.resolve();
					});
				} else {
					invokeDfd.resolve();
				}
			}
		}
		// if there is now postDisplay, then, trigger it anyway
		else {
			invokeDfd.resolve();
		}

		return invokeDfd.promise();
	}
	// ------ /Private Helpers ------ //

})(jQuery);

// ------ brite ------ //
// ---------------------- //

(function($) {
	/**
	 * @namespace
	 * 
	 * briteUI jQuery extensions.
	 */
	$.fn = $.fn;

	/**
	 * 
	 * Return the component that this html element belong to. Thi traverse the tree backwards (this html element up to
	 * document) to find the closest html element containing the brite component for this name.
	 * 
	 * If a componentName is given then it will try to find the given component.
	 * 
	 * If no componentName is given, then it will return the first component found.
	 * 
	 * For example:
	 * 
	 * @example var myComponent = $(thisDiv).bComponent("myComponent");
	 * 
	 * @param {String}
	 *            componentName The component name to be match when traversing the tree, if undefined, then, the
	 *            closestComponent will be return.
	 * 
	 */
	$.fn.bComponent = function(componentName) {

		// iterate and process each matched element
		var $componentElement;
		if (componentName) {
			$componentElement = $(this).closest("[data-bcomponent='" + componentName + "']");
		} else {
			$componentElement = $(this).closest("[data-bcomponent]");
		}

		return $componentElement.data("component");

	};

	/**
	 * Get the list of components that this htmlElement contains.
	 * 
	 * @param {string}
	 *            componentName (optional) if present, will filter only the component with this matching name
	 * @return a javascript array of all the match component
	 */
	$.fn.bFindComponents = function(componentName) {
		var childrenComponents = [];

		this.each(function() {
			var $this = $(this);

			var $componentElements;

			if (componentName) {
				$componentElements = $(this).find("[data-bcomponent='" + componentName + "']");
			} else {
				$componentElements = $(this).find("[data-bcomponent]");
			}

			$componentElements.each(function() {
				var $component = $(this);
				childrenComponents.push($component.data("component"));
			});
		});

		return childrenComponents;
	}

	/**
	 * Get the list of components that this htmlElement contains.
	 * 
	 * @param {string}
	 *            componentName (optional) if present, will filter only the component with this matching name
	 * @return a javascript array of all the match component
	 */
	$.fn.bFindFirstComponent = function(componentName) {
		var childrenComponents = [];

		this.each(function() {
			var $this = $(this);

			var $componentElements;

			if (componentName) {
				$componentElements = $(this).find("[data-bcomponent='" + componentName + "']:first");
			} else {
				$componentElements = $(this).find("[data-bcomponent]:first");
			}

			$componentElements.each(function() {
				var $component = $(this);
				childrenComponents.push($component.data("component"));
			});
		});

		return childrenComponents;
	}

	/**
	 * Safely empty a HTMLElement of its children HTMLElement and bComponent by calling the preRemove and postRemove on
	 * every child components.
	 * 
	 * @return the jQuery object
	 */
	$.fn.bEmpty = function() {
		return this.each(function() {
			var $this = $(this);

			var componentChildren = $this.bFindComponents();

			// call the preRemoves
			$.each(componentChildren, function(idx, childComponent) {
				processDestroy(childComponent);
			});

			// do the empty
			$this.empty();

			// call the postRemoves
			$.each(componentChildren, function(idx, childComponent) {
				processPostDestroy(childComponent);
			});
		});
	}

	/**
	 * Safely remove a HTMLElement and the related bComponent by calling the preRemote and postRemove on every child
	 * components as well as this component.
	 * 
	 * @return what a jquery.remove would return
	 */
	$.fn.bRemove = function() {

		return this.each(function() {
			var $this = $(this);
			$this.bEmpty();

			if ($this.is("[data-bcomponent]")) {
				var component = $this.data("component");
				processDestroy(component);

				$this.remove();

				processPostDestroy(component);
			} else {
				$this.remove();
			}
		});

	}

	function processDestroy(component) {
		// The if(component) is a safeguard in case destroy gets call twice (issue when clicking fast on
		// test_brite-02-transition....)
		if (component) {
			// TODO: Need to remove the "preRemove" We should support only destroy
			var destroyFunc = component.destroy || component.preRemove;

			if ($.isFunction(destroyFunc)) {
				destroyFunc.call(component);
			}
		}
	}

	function processPostDestroy(component) {
		// The if(component) is a safeguard in case destroy gets call twice (issue when clicking fast on
		// test_brite-02-transition....)
		if (component) {
			// TODO: Need to remove the "preRemove" We should support only postDestroy
			var postDestoryFunc = component.postDestroy || component.postRemove;

			if ($.isFunction(postDestoryFunc)) {
				postDestoryFunc.call(component);
			}
		}
	}

})(jQuery);

// -------------------------- //
// ------ brite.log ------ //
// for now, just support console.log
// TODO: needs to support logger printer, formatter, and listener
(function($) {

	var INFO = "INFO", ERROR = "ERROR", DEBUG = "DEBUG";

	// TODO: needs to add the ability to add printers
	var printers = null;

	/**
	 * @namespace
	 * 
	 * Convenient
	 */
	brite.log = {

		/**
		 * @namespace
		 * 
		 */
		config : {
			/**
			 * Tell to print the debug message or not (default: false).
			 * 
			 * @type Boolean
			 */
			debugMode : false,

			/**
			 * Tell to print the log message to the console (default: true).
			 */
			consoleLog : true
		},
		/**
		 * Log info.
		 * 
		 * @param {String}
		 *            text
		 */
		info : function(text) {
			printLog(text);
		},

		/**
		 * 
		 * @param {String}
		 *            text
		 */
		error : function(text) {
			printLog(text, ERROR);
		},

		/**
		 * Log the debug message. By default the brite.log.config.debugMode=false (so, it needs to be set to "true").
		 * <br />
		 * <br />
		 * See {@link brite.log.config}
		 * 
		 * @param {String}
		 *            text
		 */
		debug : function(text) {
			if (brite.log.config.debugMode) {
				printLog(text, DEBUG);
			}
		},

		/**
		 * Add printer (the print function has two argement text and type
		 */
		addPrinter : function(printerFunc) {
			printers = printers || [];
			printers.push(printerFunc);
		}

	};

	function printLog(text, type) {
		// TODO: needs to go through the registered "loggers"

		if (brite.log.config.consoleLog) {
			printToConsole(text, type);
		}

		if (printers) {
			var printerFunc, computedType = type || INFO;
			for ( var i = 0, l = printers.length; i < l; i++) {
				printerFunc = printers[i];
				printerFunc(text, computedType);
			}
		}
	}

	function printToConsole(text, type) {
		if (window.console && window.console.log) {
			if (type) {
				text = type + " - " + text;
			}
			console.log(text);
		}
	}
	;
})(jQuery);

// ------ brite.log ------ //
// -------------------------- //

// ------------------------ //
// ------ brite.util ------ //

/**
 * @namespace
 * 
 * Some utilities
 */
brite.util = {};

(function($) {
	// Private array of chars to use
	var CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

	/**
	 * Create a random id. <br />
	 * <br />
	 * Code from: Math.uuid 2010 Robert Kieffer http://www.broofa.com
	 * 
	 * 
	 * @example brite.util.uuid(); // returns "92329D39-6F5C-4520-ABFC-AAB64544E172" brite.util.uuid(15); // 15
	 *          character ID (default base=62), returns "VcydxgltxrVZSTV" brite.util.uuid(8, 2); // returns "01001010"
	 * 
	 * @param {Number}
	 *            len (optional) length in char of the returned random ID. If absent, the standard UUID format will be
	 *            returned
	 * @param {Number}
	 *            radix (optional) radix of the random number. (Default: 62)
	 */
	brite.util.uuid = function(len, radix) {
		var chars = CHARS, uuid = [];
		radix = radix || chars.length;
		len = len || 10;
		for ( var i = 0; i < len; i++)
			uuid[i] = chars[0 | Math.random() * radix];
		return uuid.join('');
	};

	/**
	 * Return the value from this rootObj with the "." delimited path name.
	 * 
	 * Return undefined if any of the node going down is undefined.
	 * 
	 * @param {Object}
	 *            rootObj this is the root obj to start from
	 * @param {String}
	 *            pathToValue this is the "." delimited path to the value
	 * 
	 * @example brite.util.value({contact:{firstName:"Mike"}},"contact.firstName"); // return Mike
	 * 
	 */
	brite.util.value = function(rootObj, pathToValue) {
		if (!rootObj) {
			return rootObj;
		}
		// for now, return the rootObj if the pathToValue is empty or null or undefined
		if (!pathToValue) {
			return rootObj;
		}
		var result;
		var i, l, names = pathToValue.split(".");
		var iName, iVal = rootObj;
		for (i = 0, l = names.length; i < l; i++) {
			iName = names[i];
			if (iVal == null) {
				return undefined;
			}
			iVal = iVal[iName];
			if (typeof iVal === "undefined") {
				return iVal;
			}
		}
		return iVal;
	}

	/**
	 * @namespace
	 * 
	 * Array utilities
	 */
	brite.util.array = {

		/**
		 * Remove item(s) from an array. <br />
		 * <br />
		 * Code from: Array Remove - By John Resig (MIT Licensed)
		 * 
		 * @param {Object}
		 *            a the Array
		 * @param {Object}
		 *            from the first index to remove from
		 * @param {Object}
		 *            to (optional) the last index to remove
		 */
		remove : function(a, from, to) {
			var rest = a.slice((to || from) + 1 || a.length);
			a.length = from < 0 ? a.length + from : from;
			return a.push.apply(a, rest);
		},

		/**
		 * For a array of object, this will get the first index of the matching prop name/value return -1 if no match
		 * 
		 * @param {Object}
		 *            a the Array
		 * @param {Object}
		 *            propName the property name
		 * @param {Object}
		 *            propValue the property value to be matched
		 */
		getIndex : function(a, propName, propValue) {
			if (a && propName && typeof propValue != "undefined") {
				var i, obj, l = a.length;
				for ( var i = 0; i < l; i++) {
					obj = a[i];
					if (obj && obj[propName] === propValue) {
						return i;
					}
				}
			}
			return -1;
		},

		/**
		 * Sort an array of object by a propName
		 * 
		 * @param {Object}
		 *            a the Array
		 * @param {Object}
		 *            propName the property name to be sorted by
		 */
		sortBy : function(a, propName) {
			return a.sort(sortByFunc);
			function sortByFunc(a, b) {
				if (typeof a === "undefined")
					return -1;
				if (typeof b === "undefined")
					return 1;

				var x = a[propName];
				var y = b[propName];
				return ((x < y) ? -1 : ((x > y) ? 1 : 0));
			}
		},

		/**
		 * From an array of javascript obect, create a map (js object) where the key is the propName value, and the
		 * value is the array item. If the propName does not on an item exist, it will ingore the item.
		 * 
		 * @example var myVehicules = [{id:"truck",speed:80},{id:"racecar",speed:200}]; var vehiculeById =
		 *          brite.util.array.toMap(myVehicules,"id"); // vehiculeById["truck"].speed == 80
		 * @param {Object}
		 *            a The array
		 * @param {Object}
		 *            keyName the property name that will be use
		 */
		toMap : function(a, keyName) {
			var i, l = a.length;
			var map = {}, item, key;
			for (i = 0; i < l; i++) {
				item = a[i];
				key = item[keyName];
				if (typeof key != "undefined" && key != null) {
					map[key] = item;
				}
			}
			return map;
		}
	}

	/**
	 * Give a random number between two number
	 * 
	 * @param {Object}
	 *            from
	 * @param {Object}
	 *            to
	 */
	brite.util.randomInt = function(from, to) {
		var offset = to - from;
		return from + Math.floor(Math.random() * (offset + 1));
	}

	// from the "JavaScript Pattern" book
	brite.util.inherit = function(C, P) {
		var F = function() {
		};
		F.prototype = P.prototype;
		C.prototype = new F();
		C.prototype._super = P.prototype;
		C.prototype.constructor = C;
	};

})(jQuery);
// ------ /brite.util ------ //
// ------------------------ //

// ---------------------------------- //
// ------ brite.ua (User Agent) ------ //

/**
 * @namespace
 * 
 * User Agent utilities to know what capabilities the browser support.
 */
brite.ua = {};

(function($) {
	var WEBKIT_PREFIX = "-webkit-", MOZ_PREFIX = "-moz-";

	var WEBKIT_VAR_PREFIX = "Webkit", MOZ_VAR_PREFIX = "Moz";

	// privates
	var _cssVarPrefix;
	var _cssPrefix;
	var _cssHas = null;
	var _cssHasNo = null;
	
	var _hasTouch = null;
	var _hasTransition = null;
	var _hasCanvas = null;
	var _transitionPrefix = null; 
	var _eventsMap = {}; // {eventName:true/false,....}

	// TODO: need to revise this, not really future proof
	var div = document.createElement("div");
	_cssPrefix = div.style.WebkitBorderRadius === '' ? WEBKIT_PREFIX : (div.style.MozBorderRadius === '' ? MOZ_PREFIX : (div.style.borderRadius === '' ? '' : ""));
	delete div;

	var _isMoz = (_cssPrefix === MOZ_PREFIX);
	var _isWebkit = (_cssPrefix === WEBKIT_PREFIX);

	_cssVarPrefix = (_isMoz) ? MOZ_VAR_PREFIX : (_isWebkit) ? WEBKIT_VAR_PREFIX : "";
	brite.ua.cssPrefix = function() {
		return _cssPrefix;
	}

	brite.ua.cssVarPrefix = function() {
		return _cssVarPrefix;
	}

	// ------ jQuery css hooks ------ //
	// for now, just support transofrm, will add more soon (need to test)
	var css3PropNames = [ "transform" ];
	var propName;
	for ( var i = 0, l = css3PropNames.length; i < l; i++) {
		propName = css3PropNames[i];
		$.cssHooks[propName] = new CSSHook(propName);
	}

	function CSSHook(propName) {
		this.propName = propName;
		this.computedName = _cssVarPrefix + propName.substr(0, 1).toUpperCase() + propName.substr(1);
	}

	CSSHook.prototype.get = function(elem, computed, extra) {
		return $.css(elem, this.computedName);
	}

	CSSHook.prototype.set = function(elem, val) {
		elem.style[this.computedName] = val;
	}

	// ------ /jQuery css hooks ------ //

	/**
	 * return a css friendly string with all the "has-**" that this ua supports
	 * 
	 * @example 
	 *   brite.ua.cssHas(); // "has-canvas has-transition" for modern PC browsers
	 *                      // "has-canvas has-transition has-touch" in the case of touch devices
	 *   
	 */
	brite.ua.cssHas = function(){
		
		if (_cssHas === null){
			var STR = "has";
			_cssHas = "";
			$.each(brite.ua,function(key){
				var fun = brite.ua[key];
				var cssKey;
				if (key.indexOf(STR) === 0 && $.isFunction(fun)){
					if (fun.call(brite.ua)){
						cssKey = "has-" + key.substring(STR.length).toLowerCase();
						_cssHas += cssKey + " ";
					}
					
				}
			});
		}
		
		return _cssHas;
	}
	
	/**
	 * Return a css friendly version of the "no" of the has. "has-no-canvas" for example.
	 * 
	 * @example
	 *   brite.ua.
	 */
	brite.ua.cssHasNo = function(){
		if (_cssHasNo === null){
			var STR = "has";
			_cssHasNo = "";
			$.each(brite.ua,function(key){
				var fun = brite.ua[key];
				var cssKey;
				if (key.indexOf(STR) === 0 && $.isFunction(fun)){
					if (!fun.call(brite.ua)){
						cssKey = "has-no-" + key.substring(STR.length).toLowerCase();
						_cssHasNo += cssKey + " ";
					}
					
				}
			});
		}
		
		return _cssHasNo;		
	}
	/**
	 * Return true if the eventname is supported by this user agent.
	 * 
	 * @param {Object}
	 *            eventName
	 */
	brite.ua.supportsEvent = function(eventName) {
		var r = _eventsMap[eventName];
		if (typeof r === "undefined") {
			r = isEventSupported(eventName);
			_eventsMap[eventName] = r;
		}
		return r;
	}

	/**
	 * Convenient methods to know if this user agent supports touch events. It tests "touchstart".
	 */
	brite.ua.hasTouch = function() {
		return this.supportsEvent("touchstart");
	}

	brite.ua.hasCanvas = function() {
		if (_hasCanvas === null) {
			var test_canvas = document.createElement("canvas");
			_hasCanvas = (test_canvas.getContext) ? true : false
			delete test_canvas;
		}
		return _hasCanvas;
	}

	/**
	 * Return true if the user agent supports CSS3 transition.
	 */
	brite.ua.hasTransition = function() {
		if (_hasTransition === null) {
			var div = document.createElement('div');
			div.innerHTML = '<div style="-webkit-transition:color 1s linear;-moz-transition:color 1s linear;"></div>';
			_transitionPrefix = (div.firstChild.style.webkitTransition !== undefined) ? WEBKIT_PREFIX : _transitionPrefix;
			_transitionPrefix = (div.firstChild.style.MozTransition !== undefined) ? MOZ_PREFIX : _transitionPrefix;
			delete div;
			_hasTransition = (_transitionPrefix != null);
		}
		return _hasTransition;
	}

	/**
	 * Get the transition prefix for this user agent (for example "-webkit-" or "-moz-"). <br />
	 * <br />
	 * TODO: we might want to have a brite.ua.cssPrefix() since it will be the same prefix for other css properties as
	 * well
	 */
	brite.ua.transitionPrefix = function() {
		if (this.hasTransition()) {
			return _transitionPrefix;
		} else {
			return null;
		}
	}

	// ------ Privates ------ //
	var isEventSupported = (function() {
		var TAGNAMES = {
			'select' : 'input',
			'change' : 'input',
			'submit' : 'form',
			'reset' : 'form',
			'error' : 'img',
			'load' : 'img',
			'abort' : 'img'
		}
		function isEventSupported(eventName) {
			var el = document.createElement(TAGNAMES[eventName] || 'div');
			eventName = 'on' + eventName;
			var isSupported = (eventName in el);
			if (!isSupported) {
				el.setAttribute(eventName, 'return;');
				isSupported = typeof el[eventName] == 'function';
			}
			el = null;
			return isSupported;
		}
		return isEventSupported;
	})()
	// ------ /Privates ------ //

})(jQuery);

// ------ /brite.ua (User Agent) ------ //
// ----------------------------------- //

// ----------------------- //
// ------ brite.gtx ------- //

// from: https://developer.mozilla.org/en/Code_snippets/Canvas
(function($) {

	/**
	 * @constructor
	 * 
	 * @description Factory or Constructor return a "gtx" instance for this canvas which is a chainable canvas wrapper.
	 * 
	 * @example // Using gtx as a factory var gtx = brite.gtx($("#myCanvas")); // then, you can chain any HTML5 canvas
	 *          calls gtx.beginPath().strokeStyle("#aaa").lineWidth(1).moveTo(0,0); gtx.lineTo(100,100).stroke();
	 *  // You can also create a brite.gtx instance with "new" var gtx2 = new brite.gtx($("#myCanvas2"));
	 * 
	 * @param {Object}
	 *            arg can be a Canvas 2D Context element or a Canvas element.
	 */
	brite.gtx = function Gtx(arg) {
		var ctx = arg;
		// if it s a jquery object, get the first element (assume it is a canvas
		if (arg.jquery) {
			arg = arg.get(0);
		}

		// if it is a cavans object.
		if ($.isFunction(arg.getContext)) {
			ctx = arg.getContext('2d');
		}

		// This allow to use the new or just the method as a factory
		if (!(this instanceof Gtx)) {
			return new Gtx(ctx);
		}

		this.context = this.ctx = ctx;

		// build the prototype methods on first demand
		if (!this.beginPath) {
			setupPrototype();
		}
	}

	// ------ GTX Extension Methods ------ //
	// 
	/**
	 * Set the referenceScale (the width and height that correspond to the 1 ratio). All subsequent canvas commands will
	 * be scale approprietely. Set width/height as the original dimension of the canvas element.
	 * 
	 * @param {Object}
	 *            refWidth
	 * @param {Object}
	 *            refHeight
	 * @returns {brite.gtx}
	 */
	// DEPRECATED
	brite.gtx.prototype.referenceScale = function(refWidth, refHeight) {
		this._refWidth = refWidth;
		this._refHeight = refHeight;

		// compute the ratio
		computeRatio.call(this);

		return this;
	}

	/**
	 * This will make this canvas fit its parent HTML element. If the referenceScale was set, it will recompute the
	 * ratio.
	 * 
	 * @returns {brite.gtx}
	 */
	brite.gtx.prototype.fitParent = function() {
		var canvas = this.canvas();
		if (canvas) {
			var canvas = this.canvas();
			var $parent = $(canvas).parent();
			// we might want to use innerWidth/Height here.
			canvas.width = $parent.width();
			canvas.height = $parent.height();
		}


		return this;
	}

	/**
	 * Clear the canvas.
	 * 
	 * @returns {brite.gtx}
	 */
	brite.gtx.prototype.clear = function() {
		if (this.canvas()) {
			// this should create a clear
			this.canvas().width = this.canvas().width;
		}
		// if no canvas (was created with a context), just ignore.

		return this;
	}

	// ------ /Extension Methods ------ //

	// ------ Context override methods ------ //
	brite.gtx.prototype.arc = function(x, y, radius, startAngle, endAngle, antiClock) {
		this.context.arc(x, y, radius, startAngle, endAngle, antiClock);
		return this;
	}

	brite.gtx.prototype.arcTo = function(x1, y1, x2, y2, radius) {
		this.context.arcTo(x1, y1, x2, y2, radius);
		return this;
	}

	// (in double cp1x, in double cp1y, in double cp2x, in double cp2y, in double x, in double y);
	brite.gtx.prototype.bezierCurveTo = function(cp1x, cp1y, cp2x, cp2y, x, y) {
		this.context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
		return this;
	}

	// (in double cpx, in double cpy, in double x, in double y);
	brite.gtx.prototype.quadraticCurveTo = function(cpx, cpy, x, y) {
		this.context.quadraticCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
		return this;
	}

	brite.gtx.prototype.rect = function(x, y, w, h) {
		return execRect.call(this, "rect", x, y, w, h);
	}
	brite.gtx.prototype.clearRect = function(x, y, w, h) {
		return execRect.call(this, "clearRect", x, y, w, h);
	}
	brite.gtx.prototype.fillRect = function(x, y, w, h) {

		return execRect.call(this, "fillRect", x, y, w, h);
	}
	brite.gtx.prototype.strokeRect = function(x, y, w, h) {
		return execRect.call(this, "strokeRect", x, y, w, h);
	}

	// private execRect
	function execRect(methodName, x, y, w, h) {
		this.context[methodName](x, y, w, h);
		return this;
	}

	brite.gtx.prototype.moveTo = function(x, y) {
		this.context.moveTo(x, y);
		return this;
	}

	brite.gtx.prototype.lineTo = function(x, y) {
		this.context.lineTo(x, y);
		return this;
	}

	brite.gtx.prototype.translate = function(x, y) {
		this.context.translate(x, y);
		return this;

	}

	// create the chainable object for gradient
	brite.gtx.prototype.createLinearGradient = function(x0, y0, x1, y1) {
		var ctxGradient = this.ctx.createLinearGradient(x0, y0, x1, y1);
		var gtxGradient = new Gradient(ctxGradient);
		return gtxGradient;
	}

	// create the chainable object for gradient
	// (in double x0, in double y0, in double r0, in double x1, in double y1, in double r1);
	brite.gtx.prototype.createRadialGradient = function(x0, y0, r0, x1, y1, r1) {
		var ctxGradient = this.ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
		var gtxGradient = new Gradient(ctxGradient);
		return gtxGradient;
	}

	brite.gtx.prototype.fillStyle = function(arg) {
		return style(this, "fillStyle", arg);
	}

	brite.gtx.prototype.strokeStyle = function(arg) {
		return style(this, "strokeStyle", arg);
	}

	function style(g, type, arg) {
		// if getter
		if (!arg) {
			return g.ctx[type];
		}

		// if it is a gradient object, extract the value
		if (arg.ctxGradient) {
			arg = arg.ctxGradient;
		}

		g.ctx[type] = arg;
		return g;
	}

	// ------ /Context override methods ------ //

	// ------ Gradient ------ //
	function Gradient(ctxGradient) {
		this.ctxGradient = ctxGradient;
	}

	Gradient.prototype.addColorStop = function() {
		this.ctxGradient.addColorStop.apply(this.ctxGradient, arguments);
		return this;
	}

	Gradient.prototype.addColorStops = function() {
		for ( var i = 0; (i + 1) < arguments.length; i += 2) {
			this.ctxGradient.addColorStop(arguments[i], arguments[i + 1]);
		}

		return this;
	}
	// ------ /Gradient ------ //

	function setupPrototype() {
		var methods = [ 'beginPath', 'clip', 'closePath', 'drawImage', 'fill', 'fillText',
		// these are managed now 'arc','arcTo', 'lineTo', 'moveTo', 'bezierCurveTo', 'quadraticCurveTo', 'rect',,
		// 'clearRect','fillRect','strokeRect','translate'
		'restore', 'rotate', 'save', 'scale', 'setTransform', 'stroke', 'strokeText', 'transform', ];

		var getterMethods = [ 'createPattern', 'drawFocusRing', 'isPointInPath', 'measureText', // drawFocusRing not
																								// currently supported
		// The following might instead be wrapped to be able to chain their child objects
		'createImageData', 'getImageData', 'putImageData' // will wrap later
		// both of those are wrapped now >> 'createLinearGradient', 'createRadialGradient',
		];

		var props = [ 'canvas',
		// we are wrapping this one >> 'strokeStyle', 'fillStyle',
		'font', 'globalAlpha', 'globalCompositeOperation', 'lineCap', 'lineJoin', 'lineWidth', 'miterLimit', 'shadowOffsetX', 'shadowOffsetY', 'shadowBlur', 'shadowColor', 'textAlign', 'textBaseline' ];

		var gmethl, propl;
		for ( var i = 0, methl = methods.length; i < methl; i++) {
			var m = methods[i];
			brite.gtx.prototype[m] = (function(m) {
				return function() {
					this.ctx[m].apply(this.ctx, arguments);
					return this;
				};
			}(m));
		}

		for (i = 0, gmethl = getterMethods.length; i < gmethl; i++) {
			var gm = getterMethods[i];
			brite.gtx.prototype[gm] = (function(gm) {
				return function() {
					return this.ctx[gm].apply(this.ctx, arguments);
				};
			}(gm));
		}

		for (i = 0, propl = props.length; i < propl; i++) {
			var p = props[i];
			brite.gtx.prototype[p] = (function(p) {
				return function(value) {
					if (typeof value === 'undefined') {
						return this.ctx[p];
					}
					this.ctx[p] = value;
					return this;
				};
			}(p));
		}
	}
	;

})(jQuery);

// ------ /brite.gtx ------- //
// ----------------------- //
