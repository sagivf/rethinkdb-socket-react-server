const http = require('http')
const Koa = require('koa')
const Router = require('koa-router')
const cors = require('@koa/cors')
const bodyParser = require('koa-bodyparser')
const rethinkdbdash = require('rethinkdbdash')

const app = new Koa()
const router = new Router()
const server = http.createServer(app.callback())
const io = require('socket.io')(server)

const r = rethinkdbdash();

router.get('/',function (ctx) {
  ctx.body = 'Hello world';
})

io.on('connection', function (socket) {
  console.info('socket connection')

  socket.on('disconnect', function () {
    console.info('socket disconnect')
  })

  socket.on('create-components', function (components) {
    r.table('components').insert(components).run();
  })

  socket.on('change-component', function (component) {
    r.table('components').get(component.id).update(component).run();
  })

  r.table('components').changes({
    includeTypes: true,
    includeStates: true,
    includeInitial: true
  }).then(cursor => {
    let components = [];
    cursor.each(function(err, { type, state, new_val }) {
      if (type === 'state' && state === 'initializing') {
        components = [];
      }
      if (type === 'state' && state === 'ready') {
        socket.emit('init-components', components);
      }
      if (type === 'initial') {
        components.push(new_val)
      }

      if (type === 'add') {
        socket.emit('create-components', new_val);
      }
      if (type === 'change') {
        socket.emit('change-components', new_val);
      }
    });
  });

  const topUnitComponents = r.table('components').orderBy({index: r.desc('score')}).filter({type: 'device'}).limit(3);
  topUnitComponents.changes({
    includeInitial: true
  }).then(cursor => {
    let components = [];
    cursor.each(async function() {
      const value = await topUnitComponents;
      socket.emit('set-top-components', value);
    });
  });
})

app
  .use(bodyParser())
  .use(cors())
  .use(router.routes())
  .use(router.allowedMethods())

server.listen(4000)
