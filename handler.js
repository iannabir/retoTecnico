const aws = require('aws-sdk');
const translate = new aws.Translate({apiVersion: '2017-07-01'});
const axios = require('axios');
const isarray = require('isarray');
const crypto = require('crypto');

const dynamodb = new aws.DynamoDB.DocumentClient();
const table = 'retoTecnico';

const peopleMap = require('./models/people.json');
const planetsMap = require('./models/planets.json');

//Aquí usamos una técnica basada en el consumo del servicio AWS Translate, el cual traduce los atributos instántaneamente.
module.exports.apiBase = async (event) => {  
    var codeStatus;   
    let swapi = {};
    var arr;
    try {       
      const res = await axios.get('https://swapi.py4e.com/api/');
      arr = Object.keys(res.data);
      for (let i = 0; i < arr.length; i++) {      
        var params = {
          SourceLanguageCode: 'en',
          TargetLanguageCode: 'es',
          Text: arr[i]
        };
      
        var translatedText;
        await translate.translateText(params).promise()
        .then(function(data) {               
            translatedText = data.TranslatedText;
            swapi[translatedText] = res.data[arr[i]];
            codeStatus = 200;
        }).catch(function(err) {
            console.error('Ocurrió un error en el proceso de traducción: ', err);
            codeStatus = 400;
        });
        
      }  
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Hubo un error al consumir el servicio Swapi"          
        })
      };
    }
    
    
  if (codeStatus == 200){    
    return {
      statusCode: codeStatus,
      body: JSON.stringify(swapi)      
    };
  }else{
    return {
      statusCode: codeStatus,
      body: JSON.stringify({
        message: "Ocurrió un error en el proceso de traducción"
      })
    };
  }
};



//Aquí cambiamos de técnica, pues traducimos mediante la lectura de atributos en un modelo definido. (people.json)
//Hacemos uso de la función 'generateTranslation', haciendo reusabilidad de código y fácil mantenimiento de procesos. 
//La función recibe como parámetros el endPoint y el modelo de datos, el cual contiene las traducciones correspondientes.
module.exports.apiPeople = async (event) => {   
    const translatedRequest = await generateTranslation('https://swapi.py4e.com/api/people/', peopleMap); 

    if (translatedRequest.Status){
      return {
        statusCode: translatedRequest.Status,
        body: JSON.stringify({message: translatedRequest.Message})
      };
    }else{
      return {
        statusCode: 200,
        body: JSON.stringify(translatedRequest)
      };
    }
};


//De manera similar, invocamos nuevamente a la función, cambiando el endPoint y el modelo de traducción (planets.json).
module.exports.apiPlanets = async (event) => {    
    const translatedRequest = await generateTranslation('https://swapi.py4e.com/api/planets/', planetsMap); 

    if (translatedRequest.Status){
      return {
        statusCode: translatedRequest.Status,
        body: JSON.stringify({message: translatedRequest.Message})
      };
    }else{
      return {
        statusCode: 200,
        body: JSON.stringify(translatedRequest)
      };
    }

};

 
async function generateTranslation(urlSwapi, fileModel){
  var arr;
  var englishBody = [];
  var spanishBody = {};

  try {
    const res = await axios.get(urlSwapi);
    englishBody = res.data;
    arr = Object.keys(englishBody);
    for (let i = 0; i < arr.length; i++) {
      if (isarray(englishBody[arr[i]])){ 
        var subArrayItems = englishBody[arr[i]];  
        var arrs = [];
        for (let j = 0; j < subArrayItems.length; j++) {   
          var attributes = Object.keys(englishBody[arr[i]][j]); 
          var obj = {};      
          attributes.map(function(x) {
            obj[fileModel[x]] = subArrayItems[j][x];
          }); 
          arrs.push(obj);          
        } 
        spanishBody[fileModel[arr[i]]] = arrs;
            
      }else{
        spanishBody[fileModel[arr[i]]] = englishBody[arr[i]];         
      }       
    }

    return spanishBody;
  } catch (err) {
     console.error("Ocurrió un error al resolver la URL: ", err);
     spanishBody.Status = 400;
     spanishBody.Message = "Ocurrió un error al resolver la URL.";
     return spanishBody;
  }
    
}


module.exports.programmers = async (event) => {
    var body  = JSON.parse(event.body);
    var identifier = crypto.randomBytes(16).toString('hex');
    var statusCode;
    var msg;
    
    const params = {
      TableName: table,             
      Item: {
        id: identifier,                  
        nombres: body.nombres,
        apellidos: body.apellidos,
        edad: body.edad,
        genero: body.genero,
        gradoDeInstruccion: body.gradoDeInstruccion,
        aniosDeExperiencia: body.aniosDeExperiencia,
        habilidadesBlandas: body.habilidadesBlandas,
        lenguajesDeProgramacion: body.lenguajesDeProgramacion,
        certificaciones: body.certificaciones,
        expectativaSalarial: body.expectativaSalarial               
      }
    };
    await dynamodb.put(params).promise()
        .then(function(data) {            
           statusCode = 201;
           msg = "Datos registrados correctamente";
        }).catch(function(err) {
           console.error(err);
           statusCode = 400;   
           msg = "Hubo un error al insertar el ítem en la base de datos, por favor, inténtelo nuevamente.";       
        });  

    if (statusCode == 201){
      console.log(msg, '. Identificador: ', identifier);
      return {
        statusCode: 201,
        body: JSON.stringify({
          message: msg,
          data: {
            id: identifier
          }          
        })
      }; 
    }else{
      console.error(msg);
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: msg          
        })
      };
    }     
}


module.exports.listProgrammers = async (event) => {
    var statusCode, result, msg;
    var programmers;
    var sortArray = [];
    const params = {
      TableName: table     
    };
    await dynamodb.scan(params).promise()
        .then(function(data) {            
           statusCode = 200;
           result = data;
           msg = "Datos devueltos correctamente";
        }).catch(function(err) {
           console.error(err);
           statusCode = 400;   
           msg = "Hubo un error al recuperar los ítems de la base de datos, por favor, inténtelo nuevamente.";       
        });  
   

        if (statusCode == 200){
          console.log(msg);
          programmers = result.Items;

          if(programmers.length > 0){
              //Realizamos un pequeño artificio, para presentar el orden exactamente como lo introducimos en el endPoint POST.
              //Nota importante: DynamoDB no siempre puede devolver en el mismo orden en que los atributos fueron guardados.
              for (let n = 0; n < programmers.length; n++) {  
                var itemProgrammer = {}; 
                itemProgrammer['id'] = programmers[n]['id'];
                itemProgrammer['nombres'] = programmers[n]['nombres'];
                itemProgrammer['apellidos'] = programmers[n]['apellidos'];
                itemProgrammer['edad'] = programmers[n]['edad'];
                itemProgrammer['genero'] = programmers[n]['genero'];
                itemProgrammer['gradoDeInstruccion'] = programmers[n]['gradoDeInstruccion'];
                itemProgrammer['aniosDeExperiencia'] = programmers[n]['aniosDeExperiencia'];
                itemProgrammer['habilidadesBlandas'] = programmers[n]['habilidadesBlandas'];
                itemProgrammer['lenguajesDeProgramacion'] = programmers[n]['lenguajesDeProgramacion'];
                itemProgrammer['certificaciones'] = programmers[n]['certificaciones'];
                itemProgrammer['expectativaSalarial'] = programmers[n]['expectativaSalarial'];
                sortArray.push(itemProgrammer);          
              } 

              return {
                statusCode: 200,
                body: JSON.stringify(sortArray)
              };
          }else{
              return {
                statusCode: 200,
                body: JSON.stringify({message: "No hay resultados para mostrar"})
              };
          }
           
        }else{
          console.error(msg);
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: msg          
            })
          };
        }     
}


module.exports.programmer = async (event) => {
  var sortArray = [];
  var idProgrammer = event.pathParameters.id;
  if (idProgrammer == null || idProgrammer == ""){
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Se debe colocar un id para realizar la búsqueda"        
      })
    };
  }else{
      var statusCode, result;
      var msg;
      
      const params = {
        TableName: table,
        FilterExpression: "id = :idProgrammer",        
        ExpressionAttributeValues: {
            ":idProgrammer": idProgrammer
        }
      }

      await dynamodb.scan(params).promise()
      .then(function(data) {            
        statusCode = 200;
        result = data;
        msg = "Datos devueltos correctamente";
      }).catch(function(err) {
        statusCode = 400;   
        msg = "Hubo un error al recuperar los ítems de la base de datos, por favor, inténtelo nuevamente.";       
      }); 
  } 
 


    if (statusCode == 200){
      console.log(msg);
      var prog = result.Items[0];
      if (prog){
          var itemProgrammer = {}; 
          itemProgrammer['id'] = prog['id'];
          itemProgrammer['nombres'] = prog['nombres'];
          itemProgrammer['apellidos'] = prog['apellidos'];
          itemProgrammer['edad'] = prog['edad'];
          itemProgrammer['genero'] = prog['genero'];
          itemProgrammer['gradoDeInstruccion'] = prog['gradoDeInstruccion'];
          itemProgrammer['aniosDeExperiencia'] = prog['aniosDeExperiencia'];
          itemProgrammer['habilidadesBlandas'] = prog['habilidadesBlandas'];
          itemProgrammer['lenguajesDeProgramacion'] = prog['lenguajesDeProgramacion'];
          itemProgrammer['certificaciones'] = prog['certificaciones'];
          itemProgrammer['expectativaSalarial'] = prog['expectativaSalarial'];
          sortArray.push(itemProgrammer);  
        return {
          statusCode: 200,
          body: JSON.stringify(sortArray)
        };
      }else{
        return {
          statusCode: 200,
          body: JSON.stringify({message: "No se encontraron resultados"})
        };
      }
       
    }else{
      console.error(msg);
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: msg          
        })
      };
    }     
}