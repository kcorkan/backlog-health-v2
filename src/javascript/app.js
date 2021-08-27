Ext.override(Rally.data.wsapi.Proxy, { timeout:240000 });
// Ext.override(Rally.app.App, {
//     /**
//      * OVERRIDE: PreferenceManager.update returns records, not an updated settings
//      * hash. This method in the SDK appears to simply apply the wrong data
//      * to this.settings
//      */

//     /**
//      * Update the settings for this app in preferences.
//      * Provide a settings hash and this will update existing prefs or create new prefs.
//      * @param options.settings the settings to create/update
//      * @param options.success called when the prefs are loaded
//      * @param options.scope scope to call success with
//      */
//     updateSettingsValues: function(options) {
//         Rally.data.PreferenceManager.update(Ext.apply(this._getAppSettingsLoadOptions(), {
//             requester: this,
//             settings: options.settings,
//             success: function(updatedSettings) {
//                 var updatedSettingsHash = _.reduce(updatedSettings, function(accumulator, updatedSetting) {
//                     accumulator[updatedSetting.get('Name')] = updatedSetting.get('Value');
//                     return accumulator;
//                 }, {});
//                 Ext.apply(this.settings, updatedSettingsHash);

//                 if (options.success) {
//                     options.success.call(options.scope);
//                 }
//             },
//             scope: this
//         }));
//     }
// })

/* global Ext Rally Constants Utils */
Ext.define("Rally.app.BacklogHealth", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    items: [{
        id: 'Utils.AncestorPiAppFilter.RENDER_AREA_ID',
        xtype: 'container',
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    },
        {
            xtype: 'container',
            itemId: 'controls-area',
            layout: 'hbox'
        },
        {
            xtype: 'container',
            itemId: 'filters-area',
        },
        {
            id: 'grid-area',
            xtype: 'container',
            flex: 1,
            type: 'vbox',
            align: 'stretch'
        }
    ],
    config: {
        defaultSettings: {
            artifactType: 'HierarchicalRequirement',
            timeboxType: Constants.TIMEBOX_TYPE_ITERATION,
            timeboxCount: 5,
            currentTimebox: true,
            query: "(Project.Children.State != \"Open\")",
            includeAll: false,
            points: true 
        }
    },
    timeboxStartDateField: 'StartDate',
    timeboxEndDateField: 'EndDate',
    timeboxType: 'Iteration',
    modelName: 'HierarchicalRequirement',

    settingsChanged: false,

    launch: function() {
        
        var status = this._getNewStatus();
        this.addControls(); 
        var promises = [
        //    this.getSquads(status),
            this.getFutureTimeboxes(this.getSetting('timeboxCount'),status),
            TimeboxExtendedModelBuilder.build(this.timeboxType,'Extended' + this.timeboxType)
        ];
        Deft.Promise.all(promises).then({
            success: function(results){
                return this.getTimeboxes(results,status);
            },
            failiure: this._showError,
            scope: this 
        }).then({
            success: function(timeboxGroups){
                return this.getArtifactsLookback(timeboxGroups,status);
            },
            failure: this._showError,
            scope: this 
        }).then({
            success: this.buildChart,
            failure: this._showError,
            scope: this 
        }).always(function(){
            this.setLoading(false);
        },this);
    },
    // isProjectHighLevel: function(app){
    //     //TODO: Make sure this isn't returning closed projects 
    //     var deferred = Ext.create('Deft.Deferred');
    //     Ext.create('Rally.data.wsapi.Store', {
    //         model: 'Project',
    //         fetch: ['Name','Parent','Children'],
    //         autoLoad: false,
    //         pageSize: 1, 
    //         filters: {
    //             "property": "Parent.Parent.ObjectID",
    //             "value": this.getContext().getProject().ObjectID 
    //         }
    //     }).load({
    //         callback: function(records, operation, store){
    //             if (operation.wasSuccessful()){
    //                 app.isProjectHighLevel = records.length > 0; 
    //                 deferred.resolve(app.isProjectHighLevel);
    //             } else {
    //                 deferred.reject("Error calculating project level");
    //             }
    //         }
    //     });
    //     return deferred.promise;
    // },
  
    /**
     * Return a promise that resolves once the controls are initialized and
     * have initial values
     */
    addControls: function() {
        var filterDeferred = Ext.create('Deft.Deferred');
        var context = this.getContext();
        var controlsArea = this.down('#controls-area');
        controlsArea.removeAll();
        controlsArea.add({
            xtype: 'container',
            flex: 1
        });
        controlsArea.add({
            xtype: 'tsfieldpickerbutton',
            margin: '0 10 0 0',
            toolTipConfig: {
                html: 'Columns to Export',
                anchor: 'top'
            },
            getTitle: function() {
                return 'Export Columns';
            },
            modelNames: [this.modelName],
            _fields: Constants.STORY_DEFAULT_FIELDS,
            context: context,
            stateful: true,
            stateId: context.getScopedStateId(this.modelName + 'fields'), // columns specific to type of object
            // Always need the accepted date field
            alwaysSelectedValues: Constants.ALWAYS_SELECTED_FIELDS
        });
        
        controlsArea.add({
            xtype: 'rallybutton',
            style: {'float': 'right'},
            cls: 'secondary rly-small',
            frame: false,
            itemId: 'actions-menu-button',
            iconCls: 'icon-export',
            listeners: {
                click: function(button) {
                    var menu = Ext.widget({
                        xtype: 'rallymenu',
                        items: [{
                            text: 'Export to CSV...',
                            handler: this.exportToCSV,
                            scope: this
                        }, {
                            text: 'Export teams without velocity...',
                            handler: this.exportTeamsWithoutVelocity,
                            scope: this
                        }]
                    });
                    menu.showBy(button.getEl());
                    if (button.toolTip) {
                        button.toolTip.hide();
                    }
                },
                scope: this
            }
        });
    },
    exportTeamsWithoutVelocity: function() {

        var fields = {
            name: 'Team'
        };
        var data = _.reduce(this.timeboxGroups, function(obj,timeboxGroup){
            fields[timeboxGroup[0].get('Name')] = timeboxGroup[0].get('Name');
                
            for (var i=0; i<timeboxGroup.length ; i++){
                var timebox = timeboxGroup[i],
                    project = timebox.get('Project').Name,
                    name = timebox.get('Name'); 

                if (!obj[project]){ obj[project] = {}; }
                obj[project][name] = timebox.getPlannedCapacity() > 0 ? "" : "Missing";
            }
            return obj; 
        },{});

        var fieldKeys = _.keys(fields);
        var rows = _.reduce(data, function(csv,timeboxObj, projectName){
            var row = {
                name: projectName
            }
            for (var i=0; i<fieldKeys.length; i++){
                if (fieldKeys[i] != 'name'){
                    row[fieldKeys[i]] = timeboxObj[fieldKeys[i]] || "";
                }
            }
            csv.push(row);
            return csv;
        },[]);

        var csvText = CArABU.technicalservices.FileUtilities.convertDataArrayToCSVText(rows, fields);
        CArABU.technicalservices.FileUtilities.saveCSVToFile(csvText, 'missing_velocity.csv');
    },
    exportToCSV: function(){
        
            this.setLoading(true);
            var key = 'export data';
            var status = this._getNewStatus();
            var dataContext = this.getContext().getDataContext();
            dataContext.includePermissions = false;
            var timeboxGroups = this.timeboxGroups;           
            var fetchFieldsForExport = this.getFieldsForExport();
            var promises = _.map(timeboxGroups, function(timeboxGroup){
                var timeboxOids = _.map(timeboxGroup, function(t){
                    return t.get('ObjectID');
                });
                return this.fetchArtifacts(this.modelName,fetchFieldsForExport,timeboxOids,status,key);
            }, this);

            if (promises.length > 0){
                Deft.Promise.all(promises).then({
                    scope: this,
                    success: function(groups) {
                        var artifacts = _.map(_.flatten(groups), function(a){
                            return a.getData();
                        });
                        var exportfields =  _.reduce(fetchFieldsForExport, function(accum, field) {
                            accum[field] = field;
                            return accum;
                        }, {}, this);
                        var csvText = CArABU.technicalservices.FileUtilities.convertDataArrayToCSVText(artifacts, exportfields);
                        CArABU.technicalservices.FileUtilities.saveCSVToFile(csvText, 'backlog-health.csv');
                        this.setLoading(false);
                    }
                });
            } else {
                Rally.ui.notify.Notifier.show({message: "No data to export."});
            }
    },

    getFieldsForExport: function() {
        var fieldPicker = this.down('tsfieldpickerbutton');
        var result = [];
        if (fieldPicker) {
            result = fieldPicker.getFields();
        }
        if (this.getSetting('points')) {
            result.push('PlanEstimate');
        }
        return result;
    },

    // Usual monkey business to size gridboards
    onResize: function() {
        this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight() - Constants.APP_RESERVED_HEIGHT)
        }
    },

    _getKey: function(artifactOid, timeboxOid){
        return artifactOid + '-' + timeboxOid;
    },
  
    _getNewStatus: function(){
        var app = this;
        return {
            counters: {},
            errors: [],
            addError: function(key) {
                this.errors.push('Error loading ' + key);
            },
            progressStart: function(key) {
                this.counters[key] = this.counters[key] || {total: 0, complete: 0};
                this.counters[key].total++;
                this.progressUpdate(key);
            },
            progressEnd: function(key) {
                this.counters[key] = this.counters[key] || {total: 0, complete: 0};
                this.counters[key].complete++;
                this.progressUpdate(key);
            },
            progressUpdate: function() {
                if (this.errors.length > 0) {
                    app.setLoading(this.errors.join('\n'));
                } else {
                    var statusMessages = _.map(this.counters, function(val, key) {
                        return key + ' (' + val.complete + '/' + val.total + ')'
                    })
                    app.setLoading(statusMessages.join('<br/>'));
                }
            }
        };
    },

    buildChart: function(timeboxGroups){
        var chartConfig = this.buildChartConfig(timeboxGroups);
        var chartArea = this.down('#grid-area')
        this.timeboxGroups = timeboxGroups;
        chartArea.removeAll();
        chartArea.add(chartConfig);
    },
    buildChartConfig: function(timeboxGroups){
        var yAxisTitle = ["Points/Count","Team Count"],
            chartData = this.buildChartData(timeboxGroups);
        return {
            xtype: 'rallychart',
            loadMask: false,
            chartColors: [
                "#8DC63F", // $lime
                "#FFA500", // $orange
                "#000000"// $black
            ],
            chartConfig: {
                chart: {
                    type: 'column',
                    animation: false
                },
                title: {
                    text: Constants.CHART_TITLE + ' by ' + this.timeboxType
                },
                legend: {
                    labelFormatter: function() {
                        return this.name;
                    }
                },
                plotOptions: {
                    column: {
                        stacking: 'normal'
                    },
                    series: {
                        animation: false,
                        dataLabels: {
                            align: 'center',
                            verticalAlign: 'top',
                        },
                        events: {
                            legendItemClick: function() {
                                return false;
                            } // Disable hiding some of data on legend click
                        }
                    }
                },
                yAxis: [{
                    allowDecimals: false,
                    min: 0,
                    title: {
                        text: yAxisTitle[0]
                    }
                }, {
                    allowDecimals: false,
                    min: 0,
                    title: {
                        text: yAxisTitle[1]
                    },
                    opposite: true
                }
                ]
            },
            chartData: chartData
        };
    },
    buildChartData: function(timeboxGroups){

        var chartData = {
            categories: [],
            series: [{
                data: [],
                stack: 0,
                legendIndex: 1,
                name: Constants.PLANNED
            }, {
                data: [],
                stack: 1,
                name: 'Capacity'
            }, {
                data: [],
                type: 'spline',
                yAxis: 1,
                stack: 0,
                name: 'Teams with no Velocity'
            }]
        };
        var usePoints = this.getUsePoints(),
            includeAll = this.getIncludeAll();

        _.each(timeboxGroups, function(timeboxGroup, timeboxName){
            var missingVelocities = 0,
                planned = 0,
                capacity = 0;
            
            for (var i=0; i< timeboxGroup.length; i++){
                var timebox = timeboxGroup[i],
                    plannedVelocity = timebox.getPlannedCapacity(),
                    actualPlanned = timebox.getPlannedBacklog(usePoints, includeAll);
                
                planned += actualPlanned;
                capacity += plannedVelocity;
                if (!plannedVelocity){
                    missingVelocities++;
                }
            }
            chartData.categories.push(timeboxName);
            chartData.series[0].data.push(planned);
            chartData.series[1].data.push(capacity);
            chartData.series[2].data.push(missingVelocities);
        });
        return chartData;
    },
   
    getSquadFilters: function(){
        var queryString = this.getSetting('query');
        if (queryString){
            return Rally.data.wsapi.Filter.fromQueryString(queryString);
        }
        return [];
    },

    getSquads: function(status) {
        var dataContext = this.getContext().getDataContext();
    
        var key = "Loading Projects"
        status.progressStart(key);
        return Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            autoLoad: false,
            context: dataContext,
            fetch: ['ObjectID', 'Name'],
            filters: this.getSquadFilters(),
            pageSize: 2000
        }).load().then({
            scope: this,
            success: function(projects) {
                status.progressEnd(key);
                return _.map(projects, function(prj) {
                    return prj.get('ObjectID')
                });
            }
        });
    },
    getFutureTimeboxes: function(timeboxCount,status){
        var timeboxFilterProperty = this.timeboxEndDateField;
        var key = "loading future timeboxes";
        if (this.getSetting('currentTimebox')) {
            timeboxFilterProperty = this.timeboxStartDateField;
        }
        var deferred = Ext.create('Deft.Deferred');
        status.progressStart(key);
        Ext.create('Rally.data.wsapi.Store', {
            model: this.timeboxType,
            autoLoad: false,
            context: {
                projectScopeDown: false,
                projectScopeUp: false
            },
            sorters: [{
                property: timeboxFilterProperty,
                direction: 'ASC'
            }],
            filters: [{
                property: timeboxFilterProperty,
                operator: '>=',
                value: 'today'
            }],
            pageSize: timeboxCount
        }).load({
            callback: function(records,operation,success){
                if (operation.wasSuccessful()){
                    status.progressEnd(key);
                    deferred.resolve(records);
                } else {
                    deferred.reject("Error loading timeboxes: ");
                }
            }
        });
        return deferred.promise; 
    },
    getTimeboxes: function(results,status) {
        // Get the N upcoming timeboxes in the current project
        // Sort by name
        // Get timeboxes by name from all child projects
        
        var squads = results[0],
            timeboxes = results[0],
            timeboxModel = results[1],
            timeboxFetch = this.getTimeboxFetchFields(),
            key = "loading timeboxes",
            deferred = Ext.create('Deft.Deferred');  

        var projectFilter = this.getSquadFilters();
        
        if (timeboxes.length) {
            var dataContext = this.getContext().getDataContext();
                dataContext.includePermissions = false;
                var timeboxPromises = _.map(timeboxes, function(timebox) {
                    var timeboxFilter = [{
                        property: 'Name',
                        value: timebox.get('Name')
                    },{
                        property: this.timeboxStartDateField,
                        value: timebox.get(this.timeboxStartDateField)    
                    },{
                        property: this.timeboxEndDateField,
                        value: timebox.get(this.timeboxEndDateField)
                    },projectFilter];
                    status.progressStart(key);
                    return Ext.create('Rally.data.wsapi.Store', {
                        model: timeboxModel,
                        autoLoad: false,
                        context: dataContext,
                        useShallowFetch: true,
                        fetch: timeboxFetch,
                        enablePostGet: true,
                        sorters: [{
                            property: this.timeboxEndDateField,
                            direction: 'DESC'
                        }],
                        listeners:{
                            load: function(){
                                status.progressEnd(key);
                            }
                        },
                        filters: timeboxFilter,
                        pageSize: 2000,
                        limit: Infinity
                    }).load();
                }, this);
                Deft.Promise.all(timeboxPromises).then({
                    success: function(results){
                        var timeboxes = _.flatten(results);
                        // Group by timebox name
                        var timeboxGroups = _.groupBy(timeboxes, function(timebox) {
                            return timebox.get('Name');
                        });
                        deferred.resolve(timeboxGroups);
                    },
                    failure: function(msg){
                        deferred.reject(msg);
                    },
                    scope: this 
                });
        } else {
            deferred.resolve({});
        }
        return deferred.promise; 
    },
    getIncludeAll: function(){
        return this.getSetting('includeAll') === true || this.getSetting('includeAll') === "true";
    },
    getTimeboxFetchFields: function(){
        var fields = ['ObjectID', this.timeboxStartDateField, this.timeboxEndDateField, 'Name', 'PlannedVelocity', 'PlanEstimate', 'Project'];
        if (this.getIncludeAll()){
            fields.push('WorkProducts');
        }
        return fields;
    },
    getArtifactsLookback: function(timeboxGroups,status){
        var timeboxesByOid = {},
            key = "loading Artifacts",
            deferred = Ext.create('Deft.Deferred'),
            usePoints = this.getUsePoints();
        
        var promises = [];
        var fetchFields = ['ObjectID',this.timeboxType,'PlanEstimate'];

       var promises = _.map(timeboxGroups, function(timeboxGroup) {
            var timeboxOids = _.map(timeboxGroup, function(tbox) {
                timeboxesByOid[tbox.get('ObjectID')] = tbox;
                return tbox.get('ObjectID');
            });
            return this.fetchArtifactsLookback(this.modelName,fetchFields,timeboxOids,status,key)
        }, this);

        if (promises.length > 0){
            Deft.Promise.all(promises).then({
                scope: this,
                failure: function(){
                    status.addError(key);
                    deferred.reject('Error loading artifacts');
                },
                success: function(groups) {
                    //if (usePoints){ 
                        console.log('groups',groups)

                    for (var i=0; i<groups.length; i++){
                       for (var j=0; j<groups[i].length; j++){
                            var artifact = groups[i][j];
                            var timeboxOid = artifact.get('Iteration');
                            if (!timeboxesByOid[timeboxOid]){
                                timeboxesByOid[timeboxOid] = 0;
                            } 
                            timeboxesByOid[timeboxOid].addArtifact(usePoints, artifact.getData());
                        }
                    }  
                    deferred.resolve(timeboxGroups);
                }});
        }
        return deferred.promise;

    },
    fetchArtifactsLookback: function(model,fetchFields,timeboxOids,status,key){
        var dataContext = this.getContext().getDataContext();
        dataContext.includePermissions = false; 
        var filter = Rally.data.lookback.QueryFilter.and([{
                property: '__At',
                value: "current"
            },{
                property: '_TypeHierarchy',
                value: model             
            },{
                property: this.timeboxType,
                operator: 'in',
                value: timeboxOids
            },{
                property: '_ProjectHierarchy',
                value: Rally.util.Ref.getOidFromRef(dataContext.project)              
            },{
                 property: 'PlanEstimate',
                 operator: "$gt",
                 value: 0
            },{
                property: 'ScheduleState',
                operator: "$lt",
                value: "Accepted"
            }
        ]);
       
        var store = Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad: false,
            context: dataContext,
            fetch: fetchFields,
            hydrate: [],
            remoteSort: false,
            sortConfig: {},
            compress: true,
            useHttpPost: true,
            filters: filter,
            exceptionHandler: function(proxy, request){
                status.addError(key);
            },
            listeners: {
                beforeload: function(){
                    status.progressStart(key);
                },
                load: function(){
                    status.progressEnd(key);
                },
                scope: this
            },
            limit: Infinity,
        });
        return store.load();

    },
    getArtifacts: function(timeboxGroups,status){
        var timeboxesByOid = {},
            key = "loading Artifacts",
            deferred = Ext.create('Deft.Deferred'),
            usePoints = this.getUsePoints();
        
        var promises = [];
        var fetchFields = ['ObjectID',this.timeboxType,'Project','PlanEstimate','ScheduleState','FormattedID'];

        var promises = _.map(timeboxGroups, function(timeboxGroup) {
            var timeboxOids = _.map(timeboxGroup, function(tbox) {
                timeboxesByOid[tbox.get('ObjectID')] = tbox;
                return tbox.get('ObjectID');
            });
            return this.fetchArtifacts(this.modelName,fetchFields,timeboxOids,status,key)
        }, this);

        var usePoints = this.getUsePoints();

        if (promises.length > 0){
            Deft.Promise.all(promises).then({
                scope: this,
                failure: function(){
                    status.addError(key);
                    deferred.reject('Error loading artifacts');
                },
                success: function(groups) {
                    for (var i=0; i<groups.length; i++){
                        for (var j=0; j<groups[i].length; j++){
                            var artifact = groups[i][j];
                            var timeboxOid = Rally.util.Ref.getOidFromRef(artifact.get('Iteration')._ref); 
                            if (timeboxesByOid)
                            timeboxesByOid[timeboxOid].addArtifact(usePoints, artifact.getData());
                        }
                    }
                    deferred.resolve(timeboxGroups);
                }
            });
        } else {
            deferred.resolve(timeboxGroups);
        }
        return deferred.promise;     
    },
    fetchArtifacts: function(modelName,fetchFields,timeboxOids,status,key){
        var pageSize=2000;
        var dataContext = this.getContext().getDataContext(),
            filters = [{
                property: 'Iteration.ObjectID',
                operator: 'in',
                value: timeboxOids 
            }];
           
        dataContext.includePermissions = false;
        status.progressStart(key);
        return Ext.create('Rally.data.wsapi.Store',{
            model: modelName, 
            fetch: fetchFields,
            pageSize: pageSize,
            limit: Infinity,
            autoLoad: false,
            context: dataContext,
            useShallowFetch: true,
            enablePostGet: true,
            filters: filters,
            listeners: {
                load: function(){
                    status.progressEnd(key);
                }
            }
        }).load();
    },

    getUsePoints: function(){
        return this.getSetting('points') === true || this.getSetting('points') == "true";
    },
    getIncludeAll: function(){
        return this.getSetting('includeAll') === true || this.getSetting('includeAll') == "true";
    },
    getModelScopedStateId: function(modelName, id) {
        return this.getContext().getScopedStateId(modelName + '-' + id);
    },

    getSettingsFields: function() {
        var timeboxTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                {name: Constants.TIMEBOX_TYPE_ITERATION_LABEL, value: Constants.TIMEBOX_TYPE_ITERATION},
                {name: Constants.TIMEBOX_TYPE_RELEASE_LABEL, value: Constants.TIMEBOX_TYPE_RELEASE},
            ]
        });
        var typeStoreData = [
            {name: 'User Story', value: 'HierarchicalRequirement'},
        ];
        // Called from getSettingsFields which is invoked before launch sets up the lowestPiType. Handle
        // this case.
        if (this.lowestPiType) {
            typeStoreData.push({name: this.lowestPiType.get('Name'), value: this.lowestPiType.get('TypePath')})
        }
        var artifactTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: typeStoreData
        });
        return [{
        //     xtype: 'combobox',
        //     name: 'artifactType',
        //     value: this.getSetting('artifactType'),
        //     fieldLabel: 'Artifact type',
        //     labelWidth: 150,
        //     store: artifactTypeStore,
        //     queryMode: 'local',
        //     displayField: 'name',
        //     valueField: 'value',
        //     listeners: {
        //         scope: this,
        //         change: function(field, newValue, oldValue) {
        //             if (newValue != oldValue) {
        //                 this.updateSettingsValues({
        //                     settings: {
        //                         artifactType: newValue
        //                     }
        //                 });
        //                 // Choice of artifact has changed
        //                 this.setModelFieldsForType(newValue);
        //                 // If Feature, also update timebox type to 'Release'
        //                 var timeboxTypeControl = Ext.ComponentManager.get('timeboxType');
        //                 var pointsControl = Ext.ComponentManager.get('points');
        //                 if (this.isPiTypeSelected()) {
        //                     timeboxTypeControl.setValue(Constants.TIMEBOX_TYPE_RELEASE);
        //                     timeboxTypeControl.disable(); // User cannot pick other timeboxes for Features
        //                     pointsControl.setValue(false);
        //                     pointsControl.disable();
        //                 } else {
        //                     timeboxTypeControl.enable();
        //                     pointsControl.enable();
        //                 }
        //             }
        //         }
        //     }
        // },
        //     {
        //         xtype: 'combobox',
        //         name: 'timeboxType',
        //         id: 'timeboxType',
        //         value: this.getSetting('timeboxType'),
        //         fieldLabel: 'Timebox type',
        //         labelWidth: 150,
        //         store: timeboxTypeStore,
        //         queryMode: 'local',
        //         displayField: 'name',
        //         valueField: 'value',
        //         disabled: this.isPiTypeSelected(),
        //         listeners: {
        //             scope: this,
        //             change: function(field, newValue, oldValue) {
        //                 if (newValue != oldValue) {
        //                     this.updateSettingsValues({
        //                         settings: {
        //                             timeboxType: newValue
        //                         }
        //                     });
        //                     // Choice of timebox has changed
        //                     this.setTimeboxFieldsForType(newValue);
        //                 }
        //             }
        //         }
        //     },
        //    {
                xtype: 'rallynumberfield',
                name: 'timeboxCount',
                value: this.getSetting('timeboxCount'),
                fieldLabel: "Timebox Count",
                labelWidth: 150,
                minValue: 1,
                allowDecimals: false
            }, {
                xtype: 'rallycheckboxfield',
                name: 'points',
                id: 'points',
                value: this.getSetting('points'),
                fieldLabel: 'Show by sum of Plan Estimate.',
                labelWidth: 150
            }, { 
                type: 'query',
                fieldLabel: 'Project Query String' 
            }
        ]
    }
});