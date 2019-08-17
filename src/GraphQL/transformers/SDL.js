import { buildSchema } from 'graphql';
import {
  systemClasses,
  defaultColumns,
} from '../../Controllers/SchemaController';
import { transformClassNameToGraphQL } from './className';

const RESERVED_NATIVE_TYPE = [
  '__Schema',
  '__Type',
  '__TypeKind',
  'String',
  'Boolean',
  'Float',
  'Int',
  'Mutation',
  'Query',
  'Subscription',
  '__Field',
  '__InputValue',
  '__EnumValue',
  '__Directive',
  '__DirectiveLocation',
];

// Transform a GraphQL SDL Schemma to Parse.Schema
const SDLTransformer = async (parseServer, typeDefs) => {
  const SDLSchema = buildSchema(typeDefs);
  const types = Object.keys(SDLSchema._typeMap).filter(
    type => !RESERVED_NATIVE_TYPE.includes(type)
  );
  const parseSchema = await parseServer.config.databaseController.loadSchema();
  const classes = await parseSchema.getAllClasses();

  await deleteClasses(classes, types, parseServer.config.databaseController);

  console.log(SDLSchema._typeMap.Company._fields);
};

const deleteClasses = async (classes, types, databaseController) => {
  const classesToDelete = classes.filter(
    clazz =>
      !systemClasses.includes(clazz.className) &&
      !types.includes(transformClassNameToGraphQL(clazz.className))
  );
  await Promise.all(
    classesToDelete.map(async className =>
      databaseController.deleteSchema(className)
    )
  );
};

const createOrUpdateClass = async (clazz, type) => {
  const typeFields = Object.keys(type._fields).map(fieldName => ({
    name: fieldName,
    type: JSON.stringify(type._fields[type._fields].type),
  }));
  console.log(typeFields);
};

// addClassIfNotExists(className, fields)
// updateClass(className: string,submittedFields: SchemaFields,classLevelPermissions: any,indexes: any,database: DatabaseController)
// cofing.databaseController.deleteSchema(className)

export { SDLTransformer };
