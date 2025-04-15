import mitt from 'mitt';

type Events = {
  listaVehiculosCambiada: void;
  // Add other events here as needed
};

const emitter = mitt<Events>();

export default emitter;
