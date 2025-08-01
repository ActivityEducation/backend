import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { KnowledgeGraphService } from '../services/knowledge-graph.service';
import { CreateNodeDto } from '../dto/create-node.dto';
import { CreateEdgeDto } from '../dto/create-edge.dto';

@Controller('knowledge-graph')
export class KnowledgeGraphController {
  constructor(private readonly knowledgeGraphService: KnowledgeGraphService) {}

  @Post('nodes')
  createNode(@Body() createNodeDto: CreateNodeDto) {
    return this.knowledgeGraphService.createNode(createNodeDto);
  }

  @Post('edges')
  createEdge(@Body() createEdgeDto: CreateEdgeDto) {
    return this.knowledgeGraphService.createEdge(createEdgeDto);
  }

  @Get('graph')
  public getGraph() {
    return this.knowledgeGraphService.getGraph();
  }

  @Get('nodes/:id/connected')
  getConnectedNodes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('depth', new DefaultValuePipe(2), ParseIntPipe) depth: number,
  ) {
    return this.knowledgeGraphService.getConnectedNodes(id, depth);
  }
}