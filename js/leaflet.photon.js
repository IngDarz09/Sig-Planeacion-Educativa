L.PhotonBase = L.Class.extend({

    forEach: function (els, callback) {
        Array.prototype.forEach.call(els, callback);
    },

    ajax: function (callback, thisobj) {
        if (typeof this.xhr === 'object') {
            this.xhr.abort();
        }
        this.xhr = new XMLHttpRequest();
        var self = this;
        this.xhr.open('GET', this.options.url + this.buildQueryString(this.getParams()), true);

        this.xhr.onload = function(e) {
            self.fire('ajax:return');
            if (this.status === 200) {
                if (callback) {
                    var raw = this.response;
                    raw = JSON.parse(raw);
                    callback.call(thisobj || this, raw);
                }
            }
            delete this.xhr;
        };

        this.fire('ajax:send');
        this.xhr.send();
    },

    buildQueryString: function (params) {
        var queryString = [];
        for (var key in params) {
            if (params[key]) {
                queryString.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
            }
        }
        return queryString.join('&');
    },

    featureToPopupContent: function (feature) {
        var container = L.DomUtil.create('div', 'leaflet-photon-popup'),
            title = L.DomUtil.create('h3', '', container);
        title.innerHTML = feature.properties.label;
        return container;
    }

});


L.PhotonBaseSearch = L.PhotonBase.extend({

    includes: ((typeof L.Evented !== 'undefined' && L.Evented.prototype) || L.Mixin.Events),

    options: {
        url: 'https://api-adresse.data.gouv.fr/search/?',
        placeholder: 'Buscar una dirección',
        minChar: 3,
        limit: 5,
        submitDelay: 1000,
        includePosition: true,
        bbox: null,
        noResultLabel: 'Pas de résultats',
        feedbackEmail: 'photon@komoot.de',  // Set to null to remove feedback box
        feedbackLabel: 'Feedback'
    },

    CACHE: '',
    RESULTS: [],
    KEYS: {
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        TAB: 9,
        RETURN: 13,
        ESC: 27,
        APPLE: 91,
        SHIFT: 16,
        ALT: 17,
        CTRL: 18
    },

    initialize: function (input, options) {
        this.input = input;
        L.setOptions(this, options);
        var CURRENT = null;

        try {
            Object.defineProperty(this, 'CURRENT', {
                get: function () {
                    return CURRENT;
                },
                set: function (index) {
                    if (typeof index === 'object') {
                        index = this.resultToIndex(index);
                    }
                    CURRENT = index;
                }
            });
        } catch (e) {
            // Hello IE8
        }
        this.input.type = L.Browser.ie ? 'text' : 'search';
        this.input.placeholder = this.options.placeholder;
        this.input.autocomplete = 'off';
        this.input.autocorrect = 'off';
        L.DomEvent.disableClickPropagation(this.input);

        L.DomEvent.on(this.input, 'keydown', this.onKeyDown, this);
        L.DomEvent.on(this.input, 'input', this.onInput, this);
        L.DomEvent.on(this.input, 'blur', this.onBlur, this);
        L.DomEvent.on(this.input, 'focus', this.onFocus, this);
        this.createResultsContainer();
    },

    createResultsContainer: function () {
        this.resultsContainer = this.options.resultsContainer || L.DomUtil.create('ul', 'photon-autocomplete', document.querySelector('body'));
    },

    resizeContainer: function()
    {
        var l = this.getLeft(this.input);
        var t = this.getTop(this.input) + this.input.offsetHeight;
        this.resultsContainer.style.left = l + 'px';
        this.resultsContainer.style.top = t + 'px';
        var width = this.options.width ? this.options.width : this.input.offsetWidth - 2;
        this.resultsContainer.style.width = width + 'px';
    },

    onKeyDown: function (e) {
        switch (e.keyCode) {
            case this.KEYS.TAB:
                if(this.CURRENT !== null)
                {
                    this.setChoice();
                }
                L.DomEvent.stop(e);
                break;
            case this.KEYS.RETURN:
                L.DomEvent.stop(e);
                this.setChoice();
                break;
            case this.KEYS.ESC:
                L.DomEvent.stop(e);
                this.hide();
                this.input.blur();
                break;
            case this.KEYS.DOWN:
                if(this.RESULTS.length > 0) {
                    if(this.CURRENT !== null && this.CURRENT < this.RESULTS.length - 1) { // what if one resutl?
                        this.CURRENT++;
                        this.highlight();
                    }
                    else if(this.CURRENT === null) {
                        this.CURRENT = 0;
                        this.highlight();
                    }
                }
                break;
            case this.KEYS.UP:
                if(this.CURRENT !== null) {
                    L.DomEvent.stop(e);
                }
                if(this.RESULTS.length > 0) {
                    if(this.CURRENT > 0) {
                        this.CURRENT--;
                        this.highlight();
                    }
                    else if(this.CURRENT === 0) {
                        this.CURRENT = null;
                        this.highlight();
                    }
                }
                break;
        }
    },

    onInput: function (e) {
        if (typeof this.submitDelay === 'number') {
            window.clearTimeout(this.submitDelay);
            delete this.submitDelay;
        }
        this.submitDelay = window.setTimeout(L.Util.bind(this.search, this), this.options.submitDelay);
    },

    onBlur: function (e) {
        this.fire('blur');
        var self = this;
        setTimeout(function () {
            self.hide();
        }, 100);
    },

    onFocus: function (e) {
        this.fire('focus');
        this.input.select();
        this.search();  // In case we have a value from a previous search.
    },

    clear: function () {
        this.RESULTS = [];
        this.CURRENT = null;
        this.CACHE = '';
        this.resultsContainer.innerHTML = '';
    },

    hide: function() {
        this.fire('hide');
        this.clear();
        this.resultsContainer.style.display = 'none';
    },

    setChoice: function (choice) {
        choice = choice || this.RESULTS[this.CURRENT];
        if (choice) {
            this.hide();
            this.fire('selected', {choice: choice.feature});
            this.onSelected(choice.feature);
            // this.input.value = '';
        }
    },

    search: function() {
        var val = this.input.value;
        var minChar = typeof this.options.minChar === 'function' ? this.options.minChar(val) : val.length >= this.options.minChar;
        if (!val || !minChar) return this.clear();
        if(val + '' === this.CACHE + '') return;
        else this.CACHE = val;
        this._doSearch();
    },

    _doSearch: function () {
        this.ajax(this.handleResults, this);
    },

    _onSelected: function (feature) {
    },

    onSelected: function (choice) {
        return (this.options.onSelected || this._onSelected).call(this, choice);
    },

    _formatResult: function (feature, el) {

        var title = L.DomUtil.create('strong', '', el),
            detailsContainer = L.DomUtil.create('small', '', el),
            details = [],
            type = this.formatType(feature);
            if (feature.properties.display_name) {
                title.innerHTML = feature.properties.display_name;
            } else if (feature.properties.name) {
            title.innerHTML = feature.properties.name;
        } else if (feature.properties.housenumber) {
            title.innerHTML = feature.properties.housenumber;
            if (feature.properties.street) {
                title.innerHTML += ' ' + feature.properties.street;
            }
        }
        if (type) details.push(type);
        if (feature.properties.city && feature.properties.city !== feature.properties.name) {
            details.push(feature.properties.city);
        }
        if (feature.properties.country) details.push(feature.properties.country);
        detailsContainer.innerHTML = details.join(', ');
    },

    formatResult: function (feature, el) {
        return (this.options.formatResult || this._formatResult).call(this, feature, el);
    },

    formatType: function (feature) {
        return (this.options.formatType || this._formatType).call(this, feature);
    },

    _formatType: function (feature) {
        return feature.properties.osm_value === 'yes'
               ? feature.properties.osm_key
               : feature.properties.osm_value;
    },

    createResult: function (feature) {
        var el = L.DomUtil.create('li', '', this.resultsContainer);
        this.formatResult(feature, el);
        var result = {
            feature: feature,
            el: el
        };
        // Touch handling needed
        L.DomEvent.on(el, 'mouseover', function (e) {
            this.CURRENT = result;
            this.highlight();
        }, this);
        L.DomEvent.on(el, 'mousedown', function (e) {
            this.setChoice();
        }, this);
        return result;
    },

    resultToIndex: function (result) {
        var out = null;
        this.forEach(this.RESULTS, function (item, index) {
            if (item === result) {
                out = index;
                return;
            }
        });
        return out;
    },

    handleResults: function(geojson) {
        var self = this;
        this.clear();
        this.resultsContainer.style.display = 'block';
        this.resizeContainer();
        this.forEach(geojson.features, function (feature) {
            self.RESULTS.push(self.createResult(feature));
        });
        if (geojson.features.length === 0) {
            var noresult = L.DomUtil.create('li', 'photon-no-result', this.resultsContainer);
            noresult.innerHTML = this.options.noResultLabel;
        }
        if (this.options.feedbackEmail) {
            var feedback = L.DomUtil.create('a', 'photon-feedback', this.resultsContainer);
            feedback.href = 'mailto:' + this.options.feedbackEmail;
            feedback.innerHTML = this.options.feedbackLabel;
        }
        this.CURRENT = 0;
        this.highlight();
        if (this.options.resultsHandler) {
            this.options.resultsHandler(geojson);
        }
    },

    highlight: function () {
        var self = this;
        this.forEach(this.RESULTS, function (item, index) {
            if (index === self.CURRENT) {
                L.DomUtil.addClass(item.el, 'on');
            }
            else {
                L.DomUtil.removeClass(item.el, 'on');
            }
        });
    },

    getLeft: function (el) {
        var tmp = el.offsetLeft;
        el = el.offsetParent;
        while(el) {
            tmp += el.offsetLeft;
            el = el.offsetParent;
        }
        return tmp;
    },

    getTop: function (el) {
        var tmp = el.offsetTop;
        el = el.offsetParent;
        while(el) {
            tmp += el.offsetTop;
            el = el.offsetParent;
        }
        return tmp;
    },

    getParams: function () {
        return {
            q: this.CACHE,
            lang: this.options.lang,
            limit: this.options.limit,
            osm_tag: this.options.osm_tag
        };
    }

});

L.PhotonSearch = L.PhotonBaseSearch.extend({

    initialize: function (map, input, options) {
        this.map = map;
        L.PhotonBaseSearch.prototype.initialize.call(this, input, options);
    },

    _onSelected: function (feature) {
        this.map.setView([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], 16);
    },

    getParams: function () {
        var params = L.PhotonBaseSearch.prototype.getParams.call(this);
        if (this.options.includePosition) {
            params.lat = this.map.getCenter().lat;
            params.lon = this.map.getCenter().lng;
        }
        if (this.options.bbox && this.options.bbox.length === 4) {
            params.bbox = this.options.bbox.join(',');
        }
        return params;
    }

});

L.Control.Photon = L.Control.extend({

    includes: ((typeof L.Evented !== 'undefined' && L.Evented.prototype) || L.Mixin.Events),

    onAdd: function (map, options) {
        this.map = map;
        this.container = L.DomUtil.create('div', 'leaflet-photon');

        this.options = L.Util.extend(this.options, options);

        this.input = L.DomUtil.create('input', 'photon-input', this.container);
        this.search = new L.PhotonSearch(map, this.input, this.options);
        this.search.on('blur', this.forwardEvent, this);
        this.search.on('focus', this.forwardEvent, this);
        this.search.on('hide', this.forwardEvent, this);
        this.search.on('selected', this.forwardEvent, this);
        this.search.on('ajax:send', this.forwardEvent, this);
        this.search.on('ajax:return', this.forwardEvent, this);
        return this.container;
    },

    // TODO onRemove

    forwardEvent: function (e) {
        this.fire(e.type, e);
    }

});

L.control.photon = function(options) {
    return new L.Control.Photon(options);
}

L.Map.addInitHook(function () {
    if (this.options.photonControl) {
        this.photonControl = new L.Control.Photon(this.options.photonControlOptions || {});
        this.addControl(this.photonControl);
    }
});

L.PhotonReverse = L.PhotonBase.extend({

    includes: ((typeof L.Evented !== 'undefined' && L.Evented.prototype) || L.Mixin.Events),

    options: {
        url: 'https://photon.komoot.de/reverse/?',
        limit: 1,
        handleResults: null
    },

    initialize: function (options) {
        L.setOptions(this, options);
    },

    doReverse: function (latlng) {
        latlng = L.latLng(latlng);
        this.fire('reverse', {latlng: latlng});
        this.latlng = latlng;
        this.ajax(this.handleResults, this);
    },

    _handleResults: function (data) {
        /*eslint-disable no-console */
        /*eslint-enable no-alert */
    },

    handleResults: function (data) {
        return (this.options.handleResults || this._handleResults).call(this, data);
    },

    getParams: function () {
        return {
            lang: this.options.lang,
            limit: this.options.limit,
            lat: this.latlng.lat,
            lon: this.latlng.lng,
            osm_tag: this.options.osm_tag
        };
    }

});

var obj2 = {
    value: '',
    get gcd() {
        return this.value;
    },
    set gcd(value) {
        this.value = value;
    }
}

var obj3 = {
    value: '',
    get marker() {
        return this.value;
    },
    set marker(value) {
        this.value = value;
    }
    }
/* Atlas: búsquedas explícitas, limitadas al estado de Puebla. */
;(function () {
    'use strict';
    var proximaConsulta = 0;
    function normalizar(valor) {
        return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    }
    function esPuebla(feature) {
        var p = feature && feature.properties || {};
        var a = p.address || {};
        var iso = String(a['ISO3166-2-lvl4'] || a['ISO3166-2-lvl3'] || '').toUpperCase();
        if (normalizar(a.country_code) !== 'mx') return false;
        if (iso) return iso === 'MX-PUE';
        return normalizar(a.state) === 'puebla';
    }
    L.PhotonSearch.include({
        onInput: function () { this.hide(); },
        onFocus: function () { this.fire('focus'); },
        onBlur: function () {
            this.fire('blur');
            var self = this;
            window.clearTimeout(this._atlasBlur);
            this._atlasBlur = window.setTimeout(function () { self.hide(); }, 100);
        },
        onKeyDown: function (e) {
            if (e.isComposing) return;
            var key = e.key || ({13:'Enter',27:'Escape',38:'ArrowUp',40:'ArrowDown'})[e.keyCode];
            if (key === 'Enter') {
                L.DomEvent.stop(e);
                if (this.RESULTS.length && this._atlasMostrada === this.input.value.trim()) this.setChoice();
                else this.search();
            } else if (key === 'Escape') {
                L.DomEvent.stop(e);
                this.hide();
                this.input.blur();
            } else if (key === 'ArrowDown' || key === 'ArrowUp') {
                L.DomEvent.stop(e);
                if (!this.RESULTS.length) return;
                var i = this.CURRENT === null ? (key === 'ArrowDown' ? -1 : this.RESULTS.length) : this.CURRENT;
                this.CURRENT = Math.max(0, Math.min(this.RESULTS.length - 1, i + (key === 'ArrowDown' ? 1 : -1)));
                this.highlight();
                this.RESULTS[this.CURRENT].el.scrollIntoView({block:'nearest', inline:'nearest'});
            }
        },
        _atlasCancelar: function () {
            this._atlasVersion = (this._atlasVersion || 0) + 1;
            window.clearTimeout(this._atlasEspera);
            window.clearTimeout(this._atlasBlur);
            if (this._atlasXHR) {
                var xhr = this._atlasXHR;
                this._atlasXHR = null;
                xhr.abort();
                this.fire('ajax:return');
            }
            this._atlasPendiente = null;
        },
        hide: function () {
            this._atlasCancelar();
            this._atlasMostrada = null;
            L.PhotonBaseSearch.prototype.hide.call(this);
        },
        _atlasEstado: function (texto) {
            this.clear();
            this.resultsContainer.style.display = 'block';
            this.resizeContainer();
            var li = L.DomUtil.create('li', 'photon-no-result', this.resultsContainer);
            li.textContent = texto;
        },
        getParams: function () {
            var texto = this._atlasConsulta || this.input.value.trim();
            var params = {
                q: /puebla/i.test(texto) ? texto + ', México' : texto + ', Puebla, México',
                format: 'geojson', addressdetails: 1, countrycodes: 'mx',
                'accept-language': 'es', limit: 40
            };
            var b = this.options.bbox;
            if (b && b.length === 4) {
                params.viewbox = [b[0], b[3], b[2], b[1]].join(',');
                params.bounded = 1;
            }
            return params;
        },
        search: function () {
            var self = this, consulta = this.input.value.trim();
            if (consulta.length < 3) {
                this.hide();
                if (consulta) this._atlasEstado('Escribe al menos 3 caracteres y presiona Enter.');
                return;
            }
            if (consulta === this._atlasPendiente) return;
            this._atlasCancelar();
            this._atlasConsulta = consulta;
            var version = this._atlasVersion;
            var config = window.ATLAS_DOMICILIOS || {};
            var endpoint = config.endpoint || this.options.url;
            var params = this.getParams();
            var clave = endpoint + '|' + this.buildQueryString(params);
            this._atlasCache = this._atlasCache || new Map();
            function vigente() {
                return self._atlasVersion === version && self.input.value.trim() === consulta;
            }
            function mostrar(data) {
                if (!vigente()) return;
                self._atlasPendiente = null;
                self.handleResults(data);
                self._atlasMostrada = consulta;
            }
            if (this._atlasCache.has(clave)) { mostrar(this._atlasCache.get(clave)); return; }
            this._atlasPendiente = consulta;
            this._atlasEstado('Buscando domicilios en Puebla…');
            this._atlasEspera = window.setTimeout(function () {
                if (!vigente()) return;
                proximaConsulta = Date.now() + Math.max(1100, Number(config.minIntervaloMs) || 1100);
                var xhr = new XMLHttpRequest();
                self._atlasXHR = xhr;
                var separador = endpoint.indexOf('?') < 0 ? '?' : /[?&]$/.test(endpoint) ? '' : '&';
                xhr.open('GET', endpoint + separador + self.buildQueryString(params), true);
                xhr.timeout = 15000;
                function terminar() {
                    if (self._atlasXHR === xhr) self._atlasXHR = null;
                    self.fire('ajax:return');
                }
                function error() {
                    if (!vigente()) return;
                    terminar();
                    self._atlasPendiente = null;
                    self._atlasEstado('No se pudo consultar el servicio. Presiona Enter para reintentar.');
                }
                xhr.onload = function () {
                    if (!vigente()) return;
                    if (xhr.status !== 200) { error(); return; }
                    var raw;
                    try { raw = JSON.parse(xhr.responseText); } catch (_) { error(); return; }
                    if (!raw || !Array.isArray(raw.features)) { error(); return; }
                    terminar();
                    var data = {type:'FeatureCollection', features:raw.features.filter(function (f) {
                        var c = f && f.geometry && f.geometry.coordinates;
                        return esPuebla(f) && f.geometry.type === 'Point' && Array.isArray(c) &&
                            Number.isFinite(c[0]) && Number.isFinite(c[1]);
                    }).slice(0, self.options.limit || 20)};
                    self._atlasCache.set(clave, data);
                    if (self._atlasCache.size > 50) self._atlasCache.delete(self._atlasCache.keys().next().value);
                    mostrar(data);
                };
                xhr.onerror = error;
                xhr.ontimeout = error;
                self.fire('ajax:send');
                xhr.send();
            }, Math.max(0, proximaConsulta - Date.now()));
        },
        _formatResult: function (feature, el) {
            var p = feature.properties || {};
            var title = L.DomUtil.create('strong', '', el);
            title.textContent = p.display_name || p.name || 'Domicilio en Puebla';
        },
        createResult: function (feature) {
            var el = L.DomUtil.create('li', '', this.resultsContainer);
            this.formatResult(feature, el);
            var result = {feature:feature, el:el};
            L.DomEvent.on(el, 'mouseover', function () { this.CURRENT = result; this.highlight(); }, this);
            L.DomEvent.on(el, 'mousedown', function (e) { L.DomEvent.preventDefault(e); }, this);
            L.DomEvent.on(el, 'click', function (e) { L.DomEvent.stop(e); this.setChoice(result); }, this);
            return result;
        },
        handleResults: function (data) {
            // También filtrar aquí: ninguna vía de presentación admite otros estados.
            data = {type:'FeatureCollection', features:(data.features || []).filter(esPuebla)};
            L.PhotonBaseSearch.prototype.handleResults.call(this, data);
            var creditos = L.DomUtil.create('li', 'photon-creditos-atlas', this.resultsContainer);
            var link = L.DomUtil.create('a', '', creditos);
            link.textContent = '© OpenStreetMap contributors';
            link.href = 'https://www.openstreetmap.org/copyright';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
    });
})();
