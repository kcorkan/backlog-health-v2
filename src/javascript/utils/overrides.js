Ext.override(CArABU.technicalservices.FileUtilities,{
    convertDataArrayToCSVText: function(data_array, requestedFieldHash) {

        var text = '';
        Ext.each(Object.keys(requestedFieldHash), function(key) {
            text += requestedFieldHash[key] + ',';
        });
        text = text.replace(/,$/, '\n');

        var cleanTextForCSV = function(txt){
        
            if (typeof txt === 'string'){
                var re = new RegExp("\"", 'g');
                txt= txt || "";
                txt = txt.replace(re,"\"\"");
            }
            return txt; 
        }

        Ext.each(data_array, function(d) {
            Ext.each(Object.keys(requestedFieldHash), function(key) {
                if (d[key]) {
                    console.log('key',key, d[key]);
                    if (typeof d[key] === 'object') {
                        if (d[key].FormattedID) {
                            text += Ext.String.format("\"{0}\",", d[key].FormattedID);
                        }
                        else if (d[key].Name) {
                            var val = cleanTextForCSV(d[key].Name);
                            text += Ext.String.format("\"{0}\",", val);
                        }
                        else if (d[key].EmailAddress){  //Adding for user fields 
                            text += Ext.String.format("\"{0}\",", d[key].EmailAddress);
                        }
                        else if (!isNaN(Date.parse(d[key]))) {
                            text += Ext.String.format("\"{0}\",", Rally.util.DateTime.formatWithDefaultDateTime(d[key]));
                        }
                        else if (d[key]._refObjectName){
                            var val = cleanTextForCSV(d[key]._refObjectName);
                            text += Ext.String.format("\"{0}\",", val);
                        }
                        else {
                            var val = cleanTextForCSV(d[key].toString());
                            text += Ext.String.format("\"{0}\",", val);
                        }
                    }
                    else {
                        var val = cleanTextForCSV(d[key]);
                        text += Ext.String.format("\"{0}\",", val);
                    }
                }
                else {
                    text += ',';
                }
            }, this);
            text = text.replace(/,$/, '\n');
        }, this);
        return text;
    }
});