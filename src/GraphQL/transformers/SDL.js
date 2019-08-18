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
class SDLTransformer {
  constructor(parseServer, options) {
    this.parseServer = parseServer;
    this.databaseController = parseServer.config.databaseController;
    this.options = {
      sourceOfTruth: false,
    };
    if (options) this.options = { ...this.options, ...options };
  }

  async makeSchema(typeDefs) {
    this.typeDefs = typeDefs;
    await this._prepare();
    await this._performOperations();
  }

  async checkSchema(typeDefs) {
    this.typeDefs = typeDefs;
    await this._prepare();
  }

  async _prepare() {
    this.parseClasses = [];
    this.types = {};
    this.ops = {
      classes: {
        toAdd: [],
        toUpdate: [],
        toDelete: [],
      },
      fields: {
        toAdd: {},
        toDelete: {},
      },
    };

    const SDLSchema = buildSchema(this.typeDefs);

    Object.keys(SDLSchema._typeMap)
      .filter(type => !RESERVED_NATIVE_TYPE.includes(type))
      .forEach(type => {
        this.types[type] = {};
        Object.keys(SDLSchema._typeMap[type]._fields).forEach(fieldName => {
          this.types[type][fieldName] = {
            target:
              SDLSchema._typeMap[type]._fields[fieldName].type.name ||
              SDLSchema._typeMap[type]._fields[fieldName].type.ofType.name,
            isArray: SDLSchema._typeMap[type]._fields[fieldName].type.name
              ? false
              : true,
          };
        });
      });

    const parseSchema = await this.parseServer.config.databaseController.loadSchema();
    this.parseClasses = await parseSchema.getAllClasses();

    await this._validateSchema();
  }

  async _validateSchema() {
    await this._checkClasses();
    await this._checkFields();
  }

  async _checkClasses() {
    const graphQLSystemClasses = systemClasses.map(systemClass =>
      transformClassNameToGraphQL(systemClass)
    );

    this.ops.classes.toDelete = this.parseClasses
      .filter(
        clazz =>
          !systemClasses.includes(clazz.className) &&
          !this.types[transformClassNameToGraphQL(clazz.className)]
      )
      .map(clazz => clazz.className);

    this.parseClasses.forEach(clazz => {
      Object.keys(clazz.fields).forEach(fieldName => {
        if (
          clazz.fields[fieldName].targetClass &&
          this.ops.classes.toDelete.some(
            className => className === clazz.fields[fieldName].targetClass
          )
        ) {
          if (this.ops.fields.toDelete[clazz.className])
            this.ops.fields.toDelete[clazz.className] = [];
          this.ops.fields.toDelete[clazz.className].push(fieldName);
        }
      });
    });

    this.ops.classes.toAdd = Object.keys(this.types).filter(typeName => {
      const founded = this.parseClasses.some(
        clazz => transformClassNameToGraphQL(clazz.className) === typeName
      );
      if (!founded && graphQLSystemClasses.includes(typeName))
        throw `Class ${typeName} is already reserved please change the type name`;
      return !founded;
    });

    console.log(this.ops);
  }

  async _performOperations() {
    if (this.options.sourceOfTruth) {
      await Promise.all(
        this.op.classes.toDelete.map(async className =>
          this.databaseController.deleteSchema(className)
        )
      );
    }
  }
}

export { SDLTransformer };
