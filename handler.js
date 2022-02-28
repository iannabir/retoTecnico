//Importamos la librería AWS, pero sólo a nivel de desarrollo (devDependencies, véase package.json), 
//con el fin de no aumentar el peso del package.zip, el cual se subirá a AWS S3, para después ser indexado con AWS CloudFormation.
//Además, AWS Lambda no requiere la librería AWS, ya que la tiene incorporada intrínsecamente.
const aws = require('aws-sdk');

//Importamos el servicio AWS Translate (para fines demostrativos de Integración)
const translate = new aws.Translate({apiVersion: '2017-07-01'});

//Creamos un nuevo objeto para manipular la librería de AWS DynamoDB.
const dynamodb = new aws.DynamoDB.DocumentClient();
const table = 'retoTecnico';

//Importamos otras librerías necesarias para el proyecto.
const axios = require('axios');
const isarray = require('isarray');
const crypto = require('crypto');
const Joi = require("joi");

//Hacemos un requerimiento de los modelos de traducción para las APIS.
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

// Función asíncrona que nos permite traducir las APIS.
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

//Desde este punto, veremos 3 APIS: 
// 1) API Programmers se encarga de insertar un recurso en la tabla creada de DynamoDB.
// 2) API listProgrammers se encarga de recuperar los recursos almacenados en DynamoDB.
// 3) API Programmer extrae un recurso almacenado en DynamoDB, mediante el parámetro ID.

module.exports.programmers = async (event) => {
    try {
      var body  = JSON.parse(event.body);

      // Procederemos a validar los campos, antes de insertarlos en la base de datos. MUY IMPORTANTE.
      // Para ello, haremos uso de la potente librería Joi.
      const schema = Joi.object({
        nombres: Joi.string().trim().max(30).required().messages({
          'string.base': `El campo nombres debe ser de tipo 'texto'`,
          'string.empty': `El campo nombres no debe estar vacío`,
          'any.required': `El campo nombres es requerido`,
          'string.max' : `El campo nombres debe tener 30 caracteres como máximo`
        }),
        apellidos: Joi.string().trim().max(30).required().messages({
          'string.base': `El campo apellidos debe ser de tipo 'texto'`,
          'string.empty': `El campo apellidos no debe estar vacío`,
          'any.required': `El campo apellidos es requerido`,
          'string.max' : `El campo apellidos debe tener 30 caracteres como máximo`
        }),
        edad: Joi.number().integer().strict().required().messages({
          'number.base': `El campo edad debe ser de tipo numérico`,
          'number.empty': `Ingrese el campo 'edad'`,
          'any.required': `El campo edad es requerido`,
          'number.integer': `El campo edad es numérico`,
          'number.unsafe': `El campo edad es un entero muy grande`
        }),
        genero: Joi.string().trim().max(10).required().messages({
          'string.base': `El campo genero debe ser de tipo 'texto'`,
          'string.empty': `El campo genero no debe estar vacío`,
          'any.required': `El campo genero es requerido`,
          'string.max' : `El campo genero debe tener 10 caracteres como máximo`
        }),
        gradoDeInstruccion: Joi.string().trim().max(20).required().messages({
          'string.base': `El campo gradoDeInstruccion debe ser de tipo 'texto'`,
          'string.empty': `El campo gradoDeInstruccion no debe estar vacío`,
          'any.required': `El campo gradoDeInstruccion es requerido`,
          'string.max' : `El campo gradoDeInstruccion debe tener 20 caracteres como máximo`
        }),
        aniosDeExperiencia: Joi.number().integer().strict().required().messages({
          'number.base': `El campo aniosDeExperiencia debe ser de tipo numérico`,
          'number.empty': `Ingrese el campo 'aniosDeExperiencia'`,
          'any.required': `El campo aniosDeExperiencia es requerido`,
          'number.integer': `El campo aniosDeExperiencia es numérico`,
          'number.unsafe': `El campo aniosDeExperiencia es un entero muy grande`
        }),
        habilidadesBlandas: Joi.array().min(1).required().messages({
          'any.required': `El campo habilidadesBlandas es requerido`,
          'array.min': `El campo habilidadesBlandas debe tener un objeto como mínimo`
        }),
        lenguajesDeProgramacion: Joi.array().min(1).required().messages({
          'any.required': `El campo lenguajesDeProgramacion es requerido`,
          'array.min': `El campo lenguajesDeProgramacion debe tener un objeto como mínimo`
        }),
        certificaciones: Joi.array().min(1).required().messages({
          'any.required': `El campo certificaciones es requerido`,
          'array.min': `El campo certificaciones debe tener un objeto como mínimo`
        }),
        expectativaSalarial: Joi.number().integer().strict().required().messages({
          'number.base': `El campo expectativaSalarial debe ser de tipo numérico`,
          'number.empty': `Ingrese el campo 'expectativaSalarial'`,
          'any.required': `El campo expectativaSalarial es requerido`,
          'number.integer': `El campo expectativaSalarial es numérico`,
          'number.unsafe': `El campo expectativaSalarial es un entero muy grande`
        }),
      }).options({ abortEarly: false });
  
      //Validamos el cuerpo
      const validar= schema.validate(body);    
  
      //Si hay errores, los mostramos.
      if(validar.error)                        
      {
        console.error(validar.error);
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "Se encontraron errores en la validación",
            errores: validar.error.details  
          })
        }; 
      }
      
      var identifier = crypto.randomBytes(16).toString('hex');  //Creamos un identificador
      var statusCode;
      var msg;
      
      //Construimos los parámetros para suministrarlo a la función PUT, de DynamoDB.
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

      //Usamos el operador AWAIT para esperar una PROMESA (promise). Nota: Sólo puede ser usado dentro de una función asíncrona.
      await dynamodb.put(params).promise()
          .then(function(data) {            
             statusCode = 201;
             msg = "Datos registrados correctamente";
          }).catch(function(err) {
             console.error(err);
             statusCode = 400;   
             msg = "Hubo un error al insertar el ítem en la base de datos, por favor, inténtelo nuevamente.";       
          });  
  
      //Evaluamos los statusCode que pusimos más arriba, y hacemos uso de los console.log y console.error, con la finalidad de construir un historial de logs en AWS CloudWatch.
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
    } catch (error) {      //Este Catch nos sirve para atrapar cualquier sintaxis errónea en el cuerpo de la API.
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "El request del body está malformado"          
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
  var idProgrammer = event.pathParameters.id;    //Capturamos el parámetro suministrado en la url.
  if (idProgrammer == null || idProgrammer.trim() == ""){
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