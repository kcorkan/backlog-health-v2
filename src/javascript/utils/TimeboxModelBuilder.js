Ext.define('TimeboxExtendedModelBuilder',{
    singleton: true,
    
    build: function(modelType,newModelName) {
        var deferred = Ext.create('Deft.Deferred');
        Rally.data.ModelFactory.getModel({
            type: modelType,
            success: function(model) {
                var default_fields = []; 
                
                default_fields.push({
                    name: '__planned',
                    defaultValue: null,
                    type: 'auto'
                 });    

                var new_model = Ext.define(newModelName, {
                    extend: model,

                    fields: default_fields,
                    addArtifact: function(usePoints, artifactData){
                        var planned = this.get('__planned') || 0;
                        if (usePoints){
                            planned += artifactData.PlanEstimate;
                        } else {
                            planned++;
                        }
                        this.set('__planned',planned);
                    },
                    getPlannedCapacity: function(){
                        return this.get('PlannedVelocity') || 0;
                    },
                    getPlannedBacklog: function(usePoints,includeAll){
                        if (includeAll){
                            if (usePoints){
                                return this.get('PlanEstimate') || 0;
                            }
                            return this.get('WorkProducts') && this.get('WorkProducts').Count || 0;
                        }

                        return this.get("__planned") || 0;
                    }
                });
                deferred.resolve(new_model);
            }
        });
        return deferred;
    }
});